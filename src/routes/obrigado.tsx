import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, GraduationCap, BookOpen, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { IMG } from "@/lib/platform-data";
import { optimizedImage } from "@/lib/image-url";

type PurchaseSnapshot = {
  productId: string;
  productType: "course" | "ebook";
  title: string;
  cover?: string | null;
  description?: string | null;
  confirmedAt: string;
};

export const Route = createFileRoute("/obrigado")({
  head: () => ({
    meta: [
      { title: "Compra confirmada — Ronnei na Veia" },
      {
        name: "description",
        content: "Pagamento confirmado. Seu acesso ao conteúdo do Ronnei na Veia foi liberado.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ThankYouPage,
});

function ThankYouPage() {
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState<PurchaseSnapshot | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ronnei_purchase_thank_you");
      if (!raw) {
        setReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as PurchaseSnapshot;
      const confirmedAt = new Date(parsed.confirmedAt).getTime();
      const isRecent = Number.isFinite(confirmedAt) && Date.now() - confirmedAt < 30 * 60 * 1000;
      const validType = parsed.productType === "course" || parsed.productType === "ebook";

      if (parsed.productId && parsed.title && isRecent && validType) {
        setPurchase(parsed);
      }
    } catch {
      // Snapshot inválido não deve simular uma compra confirmada.
    } finally {
      setReady(true);
    }
  }, []);

  const destination = useMemo(() => {
    if (!purchase) return "/app/cursos";
    return purchase.productType === "course"
      ? `/app/cursos/${purchase.productId}`
      : `/app/ebooks/${purchase.productId}`;
  }, [purchase]);

  const cover = useMemo(() => {
    if (!purchase) return null;
    return optimizedImage(purchase.cover || "") || purchase.cover || IMG.hero;
  }, [purchase]);

  if (!ready) {
    return <div className="min-h-screen bg-[#0a0a0a]" />;
  }

  if (!purchase) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-white/10 bg-[#111] p-8 text-center shadow-2xl">
            <ShieldCheck className="mx-auto h-12 w-12 text-[#ff6a00]" />
            <h1 className="mt-5 font-display text-3xl font-extrabold uppercase tracking-wide">
              Confirmação de compra
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/55">
              Esta página é liberada após a confirmação de um pagamento realizado na plataforma.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/app/cursos" })}
              className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ff6a00] px-6 text-sm font-extrabold text-black transition hover:bg-[#ff8c33]"
            >
              Ir para meus conteúdos <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    );
  }

  const ProductIcon = purchase.productType === "course" ? GraduationCap : BookOpen;
  const typeLabel = purchase.productType === "course" ? "Curso" : "E-book";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-12 h-80 w-80 rounded-full bg-[#ff6a00]/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-[#ff6a00]/10 blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/5 bg-black/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff6a00]">
            <img src="/favicon.png" alt="" className="h-8 w-8 object-contain brightness-0 invert" />
          </div>
          <div>
            <div className="font-display text-base font-extrabold uppercase tracking-wide">
              Ronnei <span className="text-[#ff6a00]">na Veia</span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
              Compra confirmada
            </div>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 shadow-[0_0_50px_rgba(52,211,153,0.14)]">
            <CheckCircle2 className="h-9 w-9 text-emerald-400" />
          </div>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.28em] text-[#ff6a00]">
            Pagamento aprovado
          </p>
          <h1 className="mt-3 font-display text-4xl font-black uppercase leading-none sm:text-5xl">
            Compra confirmada!
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
            Obrigado pela confiança. Seu pagamento foi confirmado e o conteúdo adquirido já está disponível na sua área de membros.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#111] shadow-2xl">
            <div className="grid sm:grid-cols-[220px_1fr]">
              <div className="relative min-h-56 bg-black/40 sm:min-h-full">
                {cover && (
                  <img
                    src={cover}
                    alt={`Capa de ${purchase.title}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => {
                      (event.currentTarget as HTMLImageElement).src = IMG.hero;
                    }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              </div>

              <div className="flex flex-col p-6 sm:p-7">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#ff6a00]">
                  <ProductIcon className="h-4 w-4" /> {typeLabel} adquirido
                </div>
                <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight">
                  {purchase.title}
                </h2>
                {purchase.description && (
                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-white/50">
                    {purchase.description}
                  </p>
                )}
                <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-3 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> Acesso liberado com sucesso
                </div>
              </div>
            </div>
          </article>

          <aside className="flex flex-col rounded-3xl border border-[#ff6a00]/20 bg-gradient-to-b from-[#16110d] to-[#101010] p-6 shadow-2xl sm:p-7">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#ff6a00]/15 text-[#ff6a00]">
              <ProductIcon className="h-5 w-5" />
            </div>
            <h2 className="mt-5 font-display text-xl font-extrabold">Seu acesso já está liberado</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Entre agora no conteúdo que você acabou de comprar ou volte para a sua área de membros.
            </p>

            <Link
              to={destination as any}
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ff6a00] px-5 text-sm font-extrabold text-black transition hover:bg-[#ff8c33]"
            >
              {purchase.productType === "course" ? "Acessar meu curso" : "Acessar meu e-book"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/app/cursos"
              className="mt-3 inline-flex h-12 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-bold text-white/70 transition hover:border-[#ff6a00]/40 hover:text-white"
            >
              Ver todos os meus conteúdos
            </Link>
          </aside>
        </div>

        <div className="mx-auto mt-6 max-w-4xl rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 text-center text-xs leading-5 text-white/35">
          Compra confirmada com segurança. Caso o conteúdo ainda não apareça na área de membros, atualize a página após alguns segundos.
        </div>
      </section>
    </main>
  );
}
