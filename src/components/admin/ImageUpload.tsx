import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatImageBytes, optimizeImageFile } from "@/lib/image-compression";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  label?: string;
  description?: string;
}

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

function isAlreadyExistsError(error: any) {
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  const message = String(error?.message ?? "").toLowerCase();
  return status === 409 || message.includes("already exists") || message.includes("duplicate");
}

export function ImageUpload({
  value,
  onChange,
  bucket = "content-covers",
  label = "Imagem de Capa",
  description = "JPG, PNG ou WebP. A imagem é otimizada automaticamente sem alterar a proporção.",
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MAX_INPUT_BYTES) {
      toast.error("A imagem deve ter no máximo 5MB");
      input.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem");
      input.value = "";
      return;
    }

    try {
      setIsUploading(true);

      // Capas não precisam transportar pixels que nenhuma tela exibirá.
      // A compressão acontece no navegador, antes de qualquer byte ser enviado
      // ao Supabase. Qualidade 0.92 mantém textos/logos muito nítidos.
      const optimized = await optimizeImageFile(file, {
        maxDimension: 1920,
        quality: 0.92,
        minSavingsRatio: 0.02,
      });

      // Content-addressed storage: a mesma imagem otimizada sempre cai no mesmo
      // caminho. Isso evita cópias duplicadas geradas por UUID a cada upload.
      const filePath = `optimized/${optimized.hash}.${optimized.extension}`;

      const { error: uploadError } = await supabase.storage.from(bucket).upload(
        filePath,
        optimized.blob,
        {
          cacheControl: "31536000",
          contentType: optimized.contentType,
          upsert: false,
        },
      );

      // Se o hash já existe, reutilizamos exatamente o mesmo objeto. Nenhum
      // overwrite é feito e nenhuma imagem existente corre risco de ser trocada.
      if (uploadError && !isAlreadyExistsError(uploadError)) throw uploadError;

      const { data: signed, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, TEN_YEARS);

      if (signedError || !signed?.signedUrl) {
        throw signedError || new Error("Não foi possível gerar a URL da imagem.");
      }

      onChange(signed.signedUrl);

      const savedBytes = Math.max(0, optimized.originalBytes - optimized.optimizedBytes);
      if (savedBytes >= 32 * 1024) {
        toast.success(
          `Imagem pronta: ${formatImageBytes(optimized.originalBytes)} → ${formatImageBytes(optimized.optimizedBytes)} sem perda visual perceptível.`,
        );
      } else {
        toast.success("Imagem enviada com qualidade preservada.");
      }
    } catch (error: any) {
      toast.error("Erro no upload: " + (error?.message || String(error)));
    } finally {
      setIsUploading(false);
      input.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</label>
      <div className="flex gap-2">
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1 bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
        />
        <label className="flex items-center justify-center px-4 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition group min-w-[50px]">
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#ff6a00]" />
          ) : (
            <>
              <Plus className="h-4 w-4 text-white/40 group-hover:text-white transition" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleUpload}
                disabled={isUploading}
              />
            </>
          )}
        </label>
      </div>
      <p className="text-[9px] text-white/30 italic">{description}</p>
    </div>
  );
}
