export type ImageCompressionOptions = {
  maxDimension?: number;
  targetBytes?: number;
  startQuality?: number;
  minQuality?: number;
};

export type ImageCompressionResult = {
  blob: Blob;
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  mimeType: string;
  extension: string;
  changed: boolean;
};

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_TARGET_BYTES = 700 * 1024;
const DEFAULT_START_QUALITY = 0.8;
const DEFAULT_MIN_QUALITY = 0.56;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível comprimir a imagem."));
      },
      type,
      quality,
    );
  });
}

async function loadImage(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await image.decode();

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

function scaledSize(width: number, height: number, maxDimension: number) {
  const largest = Math.max(width, height);
  if (largest <= maxDimension) return { width, height };

  const scale = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Comprime imagens no navegador antes de enviá-las ao Storage.
 * Mantém dimensão suficiente para capas/detalhes, converte para WebP e tenta
 * ficar abaixo do alvo de bytes sem degradar agressivamente a qualidade.
 */
export async function compressImageBlob(
  input: Blob,
  options: ImageCompressionOptions = {},
): Promise<ImageCompressionResult> {
  if (!input.type.startsWith("image/")) {
    throw new Error("O arquivo selecionado não é uma imagem válida.");
  }

  if (input.type === "image/svg+xml" || input.type === "image/gif") {
    throw new Error("Use JPG, PNG ou WebP para permitir a otimização automática.");
  }

  const maxDimension = Math.max(640, options.maxDimension ?? DEFAULT_MAX_DIMENSION);
  const targetBytes = Math.max(160 * 1024, options.targetBytes ?? DEFAULT_TARGET_BYTES);
  const startQuality = Math.min(0.92, Math.max(0.6, options.startQuality ?? DEFAULT_START_QUALITY));
  const minQuality = Math.min(startQuality, Math.max(0.45, options.minQuality ?? DEFAULT_MIN_QUALITY));

  const decoded = await loadImage(input);

  try {
    let { width, height } = scaledSize(decoded.width, decoded.height, maxDimension);
    let best: Blob | null = null;
    let bestWidth = width;
    let bestHeight = height;

    for (let sizePass = 0; sizePass < 4; sizePass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) throw new Error("Seu navegador não conseguiu preparar a imagem.");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(decoded.source, 0, 0, width, height);

      for (let quality = startQuality; quality >= minQuality - 0.001; quality -= 0.06) {
        const candidate = await canvasToBlob(canvas, "image/webp", quality);

        if (!best || candidate.size < best.size) {
          best = candidate;
          bestWidth = width;
          bestHeight = height;
        }

        if (candidate.size <= targetBytes) break;
      }

      if (best && best.size <= targetBytes) break;

      width = Math.max(640, Math.round(width * 0.84));
      height = Math.max(360, Math.round(height * 0.84));
    }

    if (!best) throw new Error("Não foi possível gerar a versão otimizada da imagem.");

    // Nunca substitui um original já pequeno por um arquivo maior.
    if (best.size >= input.size * 0.98) {
      const originalExtension =
        input.type === "image/png" ? "png" : input.type === "image/webp" ? "webp" : "jpg";

      return {
        blob: input,
        originalBytes: input.size,
        optimizedBytes: input.size,
        width: decoded.width,
        height: decoded.height,
        mimeType: input.type || "image/jpeg",
        extension: originalExtension,
        changed: false,
      };
    }

    return {
      blob: best,
      originalBytes: input.size,
      optimizedBytes: best.size,
      width: bestWidth,
      height: bestHeight,
      mimeType: "image/webp",
      extension: "webp",
      changed: true,
    };
  } finally {
    decoded.dispose();
  }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
