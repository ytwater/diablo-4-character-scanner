import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { CharacterCandidates, ItemCandidates, ScanMode } from "@acme/validators";

import { orpc } from "~/utils/api";

export type ScanStatus = "idle" | "processing" | "done" | "error";

export function useScan(mode: ScanMode) {
  const [candidates, setCandidates] = useState<CharacterCandidates | ItemCandidates>(
    mode === "item" ? { affixes: [] } : {},
  );
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation(orpc.scan.recognize.mutationOptions());

  const scanFile = async (file: File) => {
    setStatus("processing");
    setError(undefined);
    try {
      const result = await mutation.mutateAsync({ mode, image: file });
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
