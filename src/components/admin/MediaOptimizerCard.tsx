import { useState } from "react";
import { Database, Gauge, ImageDown, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImageBlob, formatBytes } from "@/lib/image-compression";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const PROJECT_HOST = "llfgqeotxneprvomllru.supabase.co";

const TARGETS = [
  { table: "courses", columns: ["cover_url"] },
  { table: "ebooks", columns: ["cover_url", "cover"] },
  { table: "recipes", columns: ["image_url"] },
  { table: "consultation_products", columns: ["cover_url"] },
] as const;

type Stats = {
  total: number;
  processed: number;
  optimized: number;
  skipped: number;
  failed: number;
  originalBytes: number;
  optimizedBytes: number;
};

const initialStats: Stats = {
  total: 0,
  processed: 0,
  optimized: 0,
  skipped: 0,
  failed: 0,
  originalBytes: 0,
  optimizedBytes: 0,
};

function parseSignedStorageUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.hostname !== PROJECT_HOST) return null;

    const match = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (!match) return null;

    return {
      bucket: decodeURIComponent(match[1]),
      path: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export function MediaOptimizerCard() {
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [current, setCurrent] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  async function collectItems() {
    const client = supabase as any;
    const items: Array<{
      table: string;
      id: string;
      columns: string[];
      url: string;
    }> = [];

    for (const target of TARGETS) {
      const select = ["id", ...target.columns].join(",");
      const { data, error } = await client.from(target.table).select(select).limit(500);
      if (error) throw new Error(`${target.table}: ${error.message}`);

      for (const row of data || []) {
        const grouped = new Map<string, string[]>();
        for (const column of target.columns) {
          const value = row[column];
          if (typeof value !== "string" || !value.trim()) continue;
          if (!parseSignedStorageUrl(value)) continue;
          grouped.set(value, [...(grouped.get(value) || []), column]);
        }

        for (const [url, columns] of grouped.entries()) {
          items.push({ table: target.table, id: String(row.id), columns, url });
        }
      }
    }

    return items;
  }

  async function optimizeOne(item: {
    table: string;
    id: string;
    columns: string[];
    url: string;
  }) {
    const client = supabase as any;
    const storageRef = parseSignedStorageUrl(item.url);
    if (!storageRef) return { status: "skipped" as const, before: 0, after: 0 };

    const response = await fetch(item.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`download ${response.status}`);

    const originalBlob = await response.blob();
    if (!originalBlob.type.startsWith("image/")) {
      return { status: "skipped" as const, before: originalBlob.size, after: originalBlob.size };
    }

    const optimized = await compressImageBlob(originalBlob, {
      maxDimension: 1600,
      targetBytes: 650 * 1024,
      startQuality: 0.8,
      minQuality: 0.56,
    });

    if (!optimized.changed || optimized.optimizedBytes >= optimized.originalBytes * 0.9) {
      return {
        status: "skipped" as const,
        before: optimized.originalBytes,
        after: optimized.optimizedBytes,
      };
    }

    const safeTable = item.table.replace(/[^a-z0-9_-]/gi, "-");
    const newPath = `optimized/${safeTable}/${item.id}-${crypto.randomUUID()}.${optimized.extension}`;

    const { error: uploadError } = await supabase.storage
      .from(storageRef.bucket)
      .upload(newPath, optimized.blob, {
        cacheControl: "31536000",
        contentType: optimized.mimeType,
        upsert: false,
      });
    if (uploadError) throw new Error(`upload: ${uploadError.message}`);

    const { data: signed, error: signedError } = await supabase.storage
      .from(storageRef.bucket)
      .createSignedUrl(newPath, TEN_YEARS);
    if (signedError || !signed?.signedUrl) {
      await supabase.storage.from(storageRef.bucket).remove([newPath]);
      throw new Error(`assinatura: ${signedError?.message || "URL não gerada"}`);
    }

    const columnLabel = item.columns.join(",");
    const { data: backup, error: backupError } = await client
      .from("media_optimization_backups")
      .insert({
        entity: item.table,
        record_id: item.id,
        column_name: columnLabel,
        original_url: item.url,
        optimized_url: signed.signedUrl,
        original_bytes: optimized.originalBytes,
        optimized_bytes: optimized.optimizedBytes,
        original_mime: originalBlob.type || null,
        optimized_mime: optimized.mimeType,
      })
      .select("id")
      .single();

    if (backupError) {
      await supabase.storage.from(storageRef.bucket).remove([newPath]);
      throw new Error(`backup: ${backupError.message}`);
    }

    const payload: Record<string, string> = {};
    for (const column of item.columns) payload[column] = signed.signedUrl;

    const { error: updateError } = await client
      .from(item.table)
      .update(payload)
      .eq("id", item.id);

    if (updateError) {
      if (backup?.id) {
        await client.from("media_optimization_backups").delete().eq("id", backup.id);
      }
      await supabase.storage.from(storageRef.bucket).remove([newPath]);
      throw new Error(`banco: ${updateError.message}`);
    }

    return {
      status: "optimized" as const,
      before: optimized.originalBytes,
      after: optimized.optimizedBytes,
    };
  }

  async function runOptimization() {
    if (running) return;
    setRunning(true);
    setStats(initialStats);
    setErrors([]);
    setCurrent("Analisando referências de mídia...");

    try {
      const items = await collectItems();
      let next: Stats = { ...initialStats, total: items.length };
      setStats(next);

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setCurrent(`${item.table} · ${index + 1}/${items.length}`);

        try {
          const result = await optimizeOne(item);
          next = {
            ...next,
            processed: next.processed + 1,
            optimized: next.optimized + (result.status === "optimized" ? 1 : 0),
            skipped: next.skipped + (result.status === "skipped" ? 1 : 0),
            originalBytes: next.originalBytes + result.before,
            optimizedBytes: next.optimizedBytes + result.after,
          };
        } catch (error: any) {
          const message = `${item.table}/${item.id}: ${error?.message || error}`;
          setErrors((prev) => [...prev, message].slice(-8));
          next = {
            ...next,
            processed: next.processed + 1,
            failed: next.failed + 1,
          };
        }

        setStats(next);
      }

      setCurrent("Otimização concluída");
      if (next.failed > 0) {
        toast.warning(`Otimização concluída com ${next.failed} falha(s).`);
      } else {
        toast.success(`Mídias otimizadas: ${next.optimized}.`);
      }
    } catch (error: any) {
      setCurrent("Falha ao preparar otimização");
      setErrors((prev) => [...prev, error?.message || String(error)]);
      toast.error(error?.message || "Falha ao otimizar mídias.");
    } finally {
      setRunning(false);
    }
  }

  const saved = Math.max(0, stats.originalBytes - stats.optimizedBytes);
  const progress = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  return (
    <Card className="border-orange-500/25 bg-orange-500/[0.04]">
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-white sm:text-base">
          <ImageDown className="h-4 w-4 text-orange-400" />
          Otimização de mídia e Egress
        </CardTitle>
        <CardDescription className="text-xs text-white/55 sm:text-sm">
          Recompacta capas atuais no navegador, envia versões leves ao Storage e troca somente as URLs usadas pelo sistema.
          Os arquivos originais não são apagados e as URLs anteriores ficam registradas para rollback.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric icon={Database} label="Encontradas" value={String(stats.total)} />
          <Metric icon={Gauge} label="Processadas" value={`${stats.processed}/${stats.total}`} />
          <Metric icon={ImageDown} label="Otimizadas" value={String(stats.optimized)} />
          <Metric icon={ShieldCheck} label="Economia" value={formatBytes(saved)} />
        </div>

        {(running || stats.processed > 0) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-[11px] text-white/45">
              <span className="truncate">{current}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {stats.originalBytes > 0 && (
          <p className="text-xs text-white/45">
            Bytes das imagens processadas: {formatBytes(stats.originalBytes)} → {formatBytes(stats.optimizedBytes)}.
            {stats.skipped > 0 ? ` ${stats.skipped} já estavam pequenas ou não precisaram de troca.` : ""}
          </p>
        )}

        {errors.length > 0 && (
          <div className="max-h-32 overflow-auto rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-300/80">
            {errors.map((error, index) => (
              <div key={`${error}-${index}`} className="break-all">{error}</div>
            ))}
          </div>
        )}

        <Button
          type="button"
          onClick={runOptimization}
          disabled={running}
          className="min-h-[44px] bg-orange-500 font-bold text-black hover:bg-orange-400"
        >
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageDown className="mr-2 h-4 w-4" />}
          {running ? "Otimizando mídias..." : "Otimizar mídias agora"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/35">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-white">{value}</div>
    </div>
  );
}
