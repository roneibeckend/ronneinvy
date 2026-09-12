import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { getOperationalStatus, type OpsHealth } from "@/lib/ops-status.functions";
import { MediaOptimizerCard } from "@/components/admin/MediaOptimizerCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/status")({
  head: () => ({
    meta: [
      { title: "Status Operacional · Admin" },
      {
        name: "description",
        content:
          "Saúde das integrações da plataforma: webhook de pagamentos, processamento diário, e-mails e últimos eventos com sucesso ou erro.",
      },
      { property: "og:title", content: "Status Operacional · Admin" },
      {
        property: "og:description",
        content: "Monitoramento de webhook, cron, saques e eventos recentes da plataforma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminStatusPage,
});

const ORANGE = "#ff6a00";

const healthMeta: Record<OpsHealth, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "Operacional", color: "text-emerald-400", Icon: CheckCircle2 },
  warning: { label: "Atenção", color: "text-amber-400", Icon: AlertTriangle },
  error: { label: "Falha", color: "text-red-400", Icon: XCircle },
  unknown: { label: "Desconhecido", color: "text-white/50", Icon: HelpCircle },
};

const statusMeta: Record<string, { label: string; className: string }> = {
  success: { label: "Sucesso", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  error: { label: "Erro", className: "border-red-500/30 bg-red-500/10 text-red-300" },
  warning: { label: "Atenção", className: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  info: { label: "Info", className: "border-white/15 bg-white/5 text-white/70" },
};

function AdminStatusPage() {
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState("all");

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-ops-status"],
    queryFn: () => getOperationalStatus({ data: undefined as never }),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const overall: OpsHealth = useMemo(() => {
    if (!data) return "unknown";
    if (data.checks.some((c) => c.health === "error")) return "error";
    if (data.checks.some((c) => c.health === "warning")) return "warning";
    return "ok";
  }, [data]);

  const events = useMemo(() => {
    const list = data?.events ?? [];
    if (filter === "all") return list;
    if (filter === "problems") return list.filter((e) => e.status === "error" || e.status === "warning");
    return list.filter((e) => e.status === filter);
  }, [data, filter]);

  if (!isAdmin) {
    return (
      <div className="p-6 text-white/60">Acesso restrito a administradores.</div>
    );
  }

  const Overall = healthMeta[overall];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-white sm:text-2xl">
            <Activity className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" style={{ color: ORANGE }} />
            <span className="min-w-0 truncate">Status Operacional</span>
          </h1>
          <p className="mt-1 text-xs text-white/50 sm:text-sm">
            Saúde das integrações e últimos eventos do sistema
            {data ? ` · atualizado ${format(new Date(data.generatedAt), "HH:mm:ss", { locale: ptBR })}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:shrink-0">
          <span className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium sm:text-sm ${Overall.color}`}>
            <Overall.Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{Overall.label}</span>
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="min-h-[44px] w-full sm:w-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </header>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 text-sm text-red-300">
            Não foi possível carregar o status: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <MediaOptimizerCard />

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: ORANGE }} />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {(data?.checks ?? []).map((check) => {
              const meta = healthMeta[check.health];
              return (
                <Card key={check.key} className="border-white/10 bg-white/[0.03]">
                  <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm text-white sm:text-base">
                      <span className="min-w-0 truncate">{check.label}</span>
                      <span className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${meta.color}`}>
                        <meta.Icon className="h-4 w-4" />
                        {meta.label}
                      </span>
                    </CardTitle>
                    <CardDescription className="break-words text-xs text-white/50 sm:text-sm">{check.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1.5 p-4 pt-0 sm:p-6 sm:pt-0">
                    {check.details.map((d) => (
                      <div key={d.label} className="flex items-start justify-between gap-3 text-xs">
                        <span className="shrink-0 text-white/40">{d.label}</span>
                        <span className="min-w-0 break-words text-right font-medium text-white/80">{d.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader className="flex flex-col gap-3 p-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-3">
              <div className="min-w-0">
                <CardTitle className="text-sm text-white sm:text-base">Últimos eventos</CardTitle>
                <CardDescription className="text-xs text-white/50 sm:text-sm">
                  Webhooks, relatórios, e-mails e registros do sistema
                </CardDescription>
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="h-11 w-full sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="problems">Somente problemas</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="warning">Atenção</SelectItem>
                  <SelectItem value="info">Informativos</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0 sm:p-6 sm:pt-0">
              {events.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/40">Nenhum evento para este filtro.</p>
              ) : (
                events.map((ev) => {
                  const meta = statusMeta[ev.status] ?? statusMeta["info"]!;
                  return (
                    <div
                      key={ev.id}
                      className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                          <span className="text-xs uppercase tracking-wide text-white/40">{ev.source}</span>
                        </div>
                        <p className="mt-1 break-words text-sm text-white/85">{ev.title}</p>
                        {ev.detail && (
                          <p className="mt-0.5 break-words text-xs text-white/45">{ev.detail}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-white/40">
                        {format(new Date(ev.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
