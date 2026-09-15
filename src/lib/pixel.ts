/**
 * Meta/Facebook Pixel helper.
 *
 * Política de rastreamento do Ronnei (origem única via GTM):
 * - PageView NÃO é enviado diretamente por este módulo.
 * - Conversões (InitiateCheckout, Lead, Purchase, AddToCart,
 *   ViewContent e CompleteRegistration) também NÃO são enviadas diretamente.
 * - O app publica os eventos no dataLayer por `src/lib/gtm.ts` e o GTM/Meta
 *   passa a ser a única origem responsável por transformá-los em eventos do Pixel.
 *
 * Isso evita que o mesmo PageView seja enviado pelo código e novamente pelo GTM.
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
 * Inicializa apenas a biblioteca/base do Meta Pixel para compatibilidade.
 *
 * Nenhum evento é disparado aqui. `autoConfig=false` e `disablePushState=true`
 * impedem que o Pixel gere eventos automáticos em paralelo ao GTM.
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
      // Base em modo estritamente manual: inicializa, mas não dispara PageView.
      window.fbq.disablePushState = true;
      window.fbq("set", "autoConfig", false, FB_PIXEL_ID);
      window.fbq("init", FB_PIXEL_ID);
    }
  }
}

/**
 * Helper legado mantido para compatibilidade com os call sites existentes.
 *
 * Todos os eventos diretos ao Meta ficam bloqueados. O rastreamento oficial
 * deve sair exclusivamente pelo dataLayer/GTM para existir uma única origem.
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
  void event;
  void params;
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
 * InitiateCheckout diretamente ao Meta; o evento deve ser configurado no GTM.
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
