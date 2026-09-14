/**
 * Meta/Facebook Pixel helper.
 *
 * Política de rastreamento do Ronnei (modo campanha/manual):
 * - PageView é o único evento enviado diretamente pelo Pixel base.
 * - Conversões (InitiateCheckout, Lead, Purchase, AddToCart,
 *   ViewContent e CompleteRegistration) NÃO são enviadas pelo código.
 * - Essas conversões devem ser configuradas manualmente no Meta/GTM.
 *
 * Importante: este bloqueio é deliberadamente fixo no código para que uma
 * variável de ambiente esquecida no deploy não reative conversões automáticas
 * e não duplique os eventos configurados pelo gestor de tráfego.
 */

const FB_PIXEL_ID: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_FB_PIXEL_ID) || "";

declare global {
  interface Window {
    fbq?: ((...args: any[]) => void) & {
      callMethod?: (...args: any[]) => void;
      queue?: any[];
      loaded?: boolean;
      version?: string;
      push?: (...args: any[]) => void;
      disablePushState?: boolean;
    };
    _fbq?: any;
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

let initialized = false;

/**
 * Carrega o Meta Pixel exatamente uma vez em modo manual.
 *
 * `autoConfig=false` desativa a configuração automática do Pixel antes do
 * `init`. `disablePushState=true` evita PageViews extras gerados pelo próprio
 * Pixel ao observar history.pushState/replaceState em uma SPA.
 *
 * As mudanças de rota continuam sendo rastreadas explicitamente pelo app.
 */
export function initPixel(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;
  initialized = true;

  if (FB_PIXEL_ID) {
    (function (f: any, b: Document, e: string, v: string) {
      if (f.fbq) return;
      const n: any = (f.fbq = function () {
        n.callMethod
          ? n.callMethod.apply(n, arguments as any)
          : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const t = b.createElement(e) as HTMLScriptElement;
      t.async = true;
      t.src = v;
      const s = b.getElementsByTagName(e)[0];
      s.parentNode?.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    if (window.fbq) {
      // Manual Only: desativa a configuração automática ANTES do init.
      window.fbq.disablePushState = true;
      window.fbq("set", "autoConfig", false, FB_PIXEL_ID);
      window.fbq("init", FB_PIXEL_ID);
      window.fbq("track", "PageView");
    }
  }
}

/**
 * Envio direto ao Meta.
 *
 * Por política de lançamento, somente PageView pode sair por este helper.
 * Os nomes de conversão continuam no tipo para manter compatibilidade com os
 * call sites existentes, mas são descartados antes de chegar ao `fbq`.
 */
export function trackEvent(
  event:
    | "PageView"
    | "InitiateCheckout"
    | "Lead"
    | "ViewContent"
    | "Purchase"
    | "AddToCart"
    | "CompleteRegistration",
  params?: Record<string, any>,
): void {
  if (typeof window === "undefined") return;
  if (event !== "PageView") return;

  try {
    window.fbq?.("track", "PageView", params);
  } catch (err) {
    console.warn("[pixel] fbq error", err);
  }
}

/**
 * Mantido por compatibilidade com o fluxo de autenticação.
 * O cadastro é medido pelo fluxo manual/GTM e não é enviado diretamente ao Meta.
 */
export function trackCompleteRegistration(
  userId: string,
  method: "email" | "google" | "facebook" | "apple" | string = "email",
): void {
  void userId;
  void method;
}

/**
 * Helper legado dos CTAs.
 * Mantido para não exigir alterações amplas no front, porém não envia
 * InitiateCheckout diretamente ao Meta no modo campanha/manual.
 */
export function trackInitiateCheckout(source: string, value = 47.9): void {
  trackEvent("InitiateCheckout", {
    content_name: "eBook Espetinho na Veia — Do Zero aos 10k",
    content_category: "ebook",
    content_ids: ["espetinho-na-veia-10k"],
    value,
    currency: "BRL",
    source,
  });
}
