import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type {
  CharacterCandidates,
  ItemCandidates,
  ScanMode,
} from "@acme/validators";

import { orpc } from "~/utils/api";

export type ScanStatus = "idle" | "processing" | "done" | "error";

// Very large/high-resolution screenshots (e.g. full 4K captures) can exceed
// the vision model's internal processing limits and fail outright. Downscale
// before upload - this also shrinks upload size and Workers AI cost. The
// model reads text, not fine detail, so a max edge of ~1600px is plenty.
const MAX_EDGE_PX = 1600;

async function downscaleImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height),
  );
  if (scale === 1) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

export function useScan(mode: ScanMode) {
  const [candidates, setCandidates] = useState<
    CharacterCandidates | ItemCandidates
  >(mode === "item" ? { affixes: [] } : {});
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation(orpc.scan.recognize.mutationOptions());

  const scanFile = async (file: File) => {
    setStatus("processing");
    setError(undefined);
    try {
      const scaled = await downscaleImage(file);
      const result = await mutation.mutateAsync({ mode, image: scaled });
      setCandidates(result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const retake = () => {
    setCandidates(mode === "item" ? { affixes: [] } : {});
    setError(undefined);
    setStatus("idle");
  };

  return { candidates, status, error, scanFile, retake };
}
