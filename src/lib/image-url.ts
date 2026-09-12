/**
 * Ajuste de URLs de imagem para carregamento rápido nas listagens.
 * - Unsplash: pede uma versão redimensionada/comprimida.
 * - Supabase Storage privado: a URL assinada precisa apontar para um arquivo
 *   já otimizado; a compactação é feita no upload pelo image-compression.
 * - Outras URLs: retornadas sem alteração.
 */
export function optimizedImage(
  url: string | null | undefined,
  width = 640,
  quality = 70,
): string {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  try {
    // URLs relativas não precisam de otimização remota.
    if (!/^https?:\/\//i.test(url)) return url;

    const parsed = new URL(url);

    if (parsed.hostname.endsWith("unsplash.com")) {
      parsed.searchParams.set("auto", "format");
      parsed.searchParams.set("fit", "crop");
      parsed.searchParams.set("w", String(width));
      parsed.searchParams.set("q", String(quality));
      return parsed.toString();
    }

    // URLs assinadas do Supabase não podem receber transformações depois de
    // assinadas. Alterar width/quality aqui invalidaria a assinatura.
    return url;
  } catch {
    return url;
  }
}
