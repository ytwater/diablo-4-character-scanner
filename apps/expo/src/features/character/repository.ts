import * as SecureStore from "expo-secure-store";

import type { Character } from "./types";
import { parseCharacter } from "./types";

export const CHARACTER_KEY = "d4.character.active";

export interface CharacterRepository {
  getActive(): Promise<Character | null>;
  save(character: Character): Promise<void>;
  clear(): Promise<void>;
}

/**
 * SecureStore is used for convenience, not secrecy: it is the only storage
 * module already autolinked into the build. Swapping to AsyncStorage later
 * means a new file implementing this interface and nothing else.
 */
export const secureStoreRepository: CharacterRepository = {
  async getActive() {
    try {
      const raw = await SecureStore.getItemAsync(CHARACTER_KEY);
      if (raw == null) return null;
      return parseCharacter(JSON.parse(raw));
    } catch {
      // A corrupt or unreadable profile is treated as absent; the user sees
      // the setup form rather than a crash.
      return null;
    }
  },

  async save(character) {
    await SecureStore.setItemAsync(CHARACTER_KEY, JSON.stringify(character));
  },

  async clear() {
    await SecureStore.deleteItemAsync(CHARACTER_KEY);
  },
};
