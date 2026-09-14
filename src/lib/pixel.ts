/**
 * Meta/Facebook Pixel helper.
 *
 * Política de rastreamento do Ronnei:
 * - PageView é enviado diretamente pelo Pixel base.
 * - Conversões (InitiateCheckout, Lead, Purchase etc.) ficam em modo manual
 *   por padrão para não competir com eventos configurados no Meta/GTM.
 * - O envio direto de conversões só pode ser reativado explicitamente com
 *   VITE_FB_DIRECT_CONVERSIONS=true.
 */

const FB_PIXEL_ID: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_FB_PIXEL_ID) || "";

const FB_DIRECT_CONVERSIONS_ENABLED =
  String(
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_FB_DIRECT_CONVERSIONS) ||
      "",
  ).toLowerCase() === "true";

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
 * `autoConfig=false` impede a coleta automática de cliques/metadados que pode
 * criar eventos inesperados. `disablePushState=true` impede PageViews extras
 * criados pelo próprio Pixel ao observar history.pushState/replaceState em SPA.
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
 * PageView permanece ativo para o Pixel base. Eventos de conversão ficam
 * bloqueados por padrão e devem ser definidos no Meta/GTM. Isso evita que um
 * mesmo clique/compra seja contado pelo código e pela configuração manual.
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
  if (event !== "PageView" && !FB_DIRECT_CONVERSIONS_ENABLED) return;

  try {
    window.fbq?.("track", event, params);
  } catch (err) {
    console.warn("[pixel] fbq error", err);
  }
}

/**
 * Cadastro direto no Meta fica desativado junto com as demais conversões.
 * O helper é mantido para compatibilidade e pode ser reativado por ambiente.
 */
export function trackCompleteRegistration(
  userId: string,
  method: "email" | "google" | "facebook" | "apple" | string = "email",
): void {
  if (typeof window === "undefined" || !userId) return;
  if (!FB_DIRECT_CONVERSIONS_ENABLED) return;

  const marker = `rnv_complete_registration_${userId}`;
  try {
    if (localStorage.getItem(marker)) return;
  } catch {
    /* O rastreamento ainda pode funcionar sem localStorage. */
  }

  initPixel();
  if (!window.fbq) return;

  window.fbq("track", "CompleteRegistration", {
    content_name: "Cadastro Ronnei na Veia",
    method,
    status: "completed",
  });

  try {
    localStorage.setItem(marker, "1");
  } catch {
    /* noop */
  }
}

/**
 * Helper legado dos CTAs.
 * Em produção ele não envia conversão direta ao Meta por padrão; o evento só
 * volta a ser enviado se VITE_FB_DIRECT_CONVERSIONS=true for definido.
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
