export type OptimizedImageResult = {
  blob: Blob;
  contentType: string;
  extension: string;
  hash: string;
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  optimized: boolean;
};

export type OptimizeImageOptions = {
  maxDimension?: number;
  quality?: number;
  minSavingsRatio?: number;
};

const DEFAULT_MAX_DIMENSION = 1920;
const DEFAULT_QUALITY = 0.92;
const DEFAULT_MIN_SAVINGS_RATIO = 0.02;

function extensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler a imagem selecionada."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("O navegador não conseguiu otimizar a imagem."));
      },
      type,
      quality,
    );
  });
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function formatImageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Reencodes cover images locally in the browser before they reach Supabase.
 * This preserves aspect ratio, caps only excessive resolution and uses a high
 * WebP quality setting. If re-encoding would make an already-small image
 * larger, the original bytes are kept instead.
 */
export async function optimizeImageBlob(
  input: Blob,
  options: OptimizeImageOptions = {},
): Promise<OptimizedImageResult> {
  if (!input.type.startsWith("image/")) {
    throw new Error("O arquivo selecionado não é uma imagem válida.");
  }

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const minSavingsRatio = options.minSavingsRatio ?? DEFAULT_MIN_SAVINGS_RATIO;

  const image = await loadImage(input);
  const originalWidth = Math.max(1, image.naturalWidth || image.width);
  const originalHeight = Math.max(1, image.naturalHeight || image.height);
  const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Seu navegador não conseguiu preparar a imagem.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  const webp = await canvasToBlob(canvas, "image/webp", quality);
  const savingsRatio = input.size > 0 ? 1 - webp.size / input.size : 1;

  const shouldKeepOriginal =
    scale === 1 &&
    savingsRatio < minSavingsRatio &&
    ["image/jpeg", "image/png", "image/webp"].includes(input.type);

  const blob = shouldKeepOriginal ? input : webp;
  const contentType = shouldKeepOriginal ? input.type : "image/webp";
  const extension = extensionForMime(contentType);
  const hash = await sha256Blob(blob);

  return {
    blob,
    contentType,
    extension,
    hash,
    originalBytes: input.size,
    optimizedBytes: blob.size,
    width,
    height,
    optimized: !shouldKeepOriginal,
  };
}

export async function optimizeImageFile(
  file: File,
  options: OptimizeImageOptions = {},
): Promise<OptimizedImageResult> {
  return optimizeImageBlob(file, options);
}
