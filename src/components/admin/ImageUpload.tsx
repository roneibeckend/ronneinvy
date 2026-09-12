import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { compressImageBlob, formatBytes } from "@/lib/image-compression";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  label?: string;
  description?: string;
}

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export function ImageUpload({
  value,
  onChange,
  bucket = "content-covers",
  label = "Imagem de Capa",
  description = "JPG, PNG ou WebP. A imagem é comprimida automaticamente antes do envio.",
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // O arquivo original pode ter até 5 MB, mas nunca é enviado cru ao Storage.
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem original deve ter no máximo 5MB");
      e.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem");
      e.target.value = "";
      return;
    }

    try {
      setIsUploading(true);

      const optimized = await compressImageBlob(file, {
        maxDimension: 1600,
        targetBytes: 700 * 1024,
        startQuality: 0.8,
        minQuality: 0.56,
      });

      const fileName = `${crypto.randomUUID()}.${optimized.extension}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, optimized.blob, {
          cacheControl: "31536000",
          contentType: optimized.mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // O bucket é privado. A URL assinada continua longa para manter os
      // registros atuais estáveis, porém agora aponta para um arquivo físico
      // já reduzido em vez do original multi-megabyte.
      const { data: signed, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(fileName, TEN_YEARS);

      if (signedError || !signed?.signedUrl) {
        await supabase.storage.from(bucket).remove([fileName]);
        throw signedError || new Error("Não foi possível gerar a URL da imagem.");
      }

      onChange(signed.signedUrl);

      if (optimized.changed) {
        const reduction = Math.max(
          0,
          Math.round((1 - optimized.optimizedBytes / optimized.originalBytes) * 100),
        );
        toast.success(
          `Imagem otimizada: ${formatBytes(optimized.originalBytes)} → ${formatBytes(optimized.optimizedBytes)} (${reduction}% menor).`,
        );
      } else {
        toast.success(`Imagem enviada (${formatBytes(optimized.optimizedBytes)}).`);
      }
    } catch (error: any) {
      toast.error("Erro no upload: " + (error?.message || error));
    } finally {
      setIsUploading(false);
      e.target.value = "";
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
