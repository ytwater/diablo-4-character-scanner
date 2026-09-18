import { useCallback, useEffect, useState } from "react";

import type { Character } from "./types";
import { secureStoreRepository } from "./repository";

export function useCharacter() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void secureStoreRepository.getActive().then((stored) => {
      if (cancelled) return;
      setCharacter(stored);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: Character) => {
    // Write first: if storage rejects, the caller surfaces the error and in-
    // memory state still matches what is actually persisted.
    await secureStoreRepository.save(next);
    setCharacter(next);
  }, []);

  const clear = useCallback(async () => {
    await secureStoreRepository.clear();
    setCharacter(null);
  }, []);

  return { character, isLoading, save, clear };
}
