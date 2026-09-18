import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  deleteItemAsync: vi.fn(async (k: string) => void store.delete(k)),
}));

const SecureStore = await import("expo-secure-store");
const { secureStoreRepository, CHARACTER_KEY } = await import("./repository");
const { createCharacter } = await import("./types");

describe("secureStoreRepository", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("returns null when nothing is stored", async () => {
    expect(await secureStoreRepository.getActive()).toBeNull();
  });

  it("round-trips a saved character", async () => {
    const c = createCharacter({ name: "UDAN", class: "Spiritborn" });
    await secureStoreRepository.save(c);
    expect(await secureStoreRepository.getActive()).toEqual(c);
  });

  it("returns null when the stored value is not valid JSON", async () => {
    store.set(CHARACTER_KEY, "{not json");
    expect(await secureStoreRepository.getActive()).toBeNull();
  });

  it("returns null when the stored record fails validation", async () => {
    store.set(CHARACTER_KEY, JSON.stringify({ id: "1", name: "UDAN", class: "Paladin" }));
    expect(await secureStoreRepository.getActive()).toBeNull();
  });

  it("returns null rather than throwing when SecureStore fails", async () => {
    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("keystore unavailable"));
    expect(await secureStoreRepository.getActive()).toBeNull();
  });

  it("propagates a save failure so the form can surface it", async () => {
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("disk full"));
    const c = createCharacter({ name: "UDAN", class: "Rogue" });
    await expect(secureStoreRepository.save(c)).rejects.toThrow();
  });

  it("clears the stored character", async () => {
    await secureStoreRepository.save(createCharacter({ name: "UDAN", class: "Rogue" }));
    await secureStoreRepository.clear();
    expect(await secureStoreRepository.getActive()).toBeNull();
  });
});
