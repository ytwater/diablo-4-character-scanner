export const D4_CLASSES = [
  "Barbarian",
  "Druid",
  "Necromancer",
  "Rogue",
  "Sorcerer",
  "Spiritborn",
] as const;

export type D4Class = (typeof D4_CLASSES)[number];

export const MAX_NAME_LENGTH = 64;

export interface Character {
  id: string;
  name: string;
  class: D4Class;
  title?: string;
  level?: number;
  updatedAt: string;
}

export function isD4Class(value: unknown): value is D4Class {
  return typeof value === "string" && (D4_CLASSES as readonly string[]).includes(value);
}

/**
 * Hermes has no crypto.randomUUID, and pulling in expo-crypto would mean a new
 * native module and a full rebuild. Uniqueness only has to hold within one
 * device's stored characters, so this is sufficient.
 */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createCharacter(input: {
  name: string;
  class: D4Class;
  title?: string;
  level?: number;
}): Character {
  const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
  if (name.length === 0) throw new Error("Character name is required");

  return {
    id: newId(),
    name,
    class: input.class,
    title: input.title?.trim() === "" ? undefined : input.title?.trim(),
    level: input.level,
    updatedAt: new Date().toISOString(),
  };
}

export function parseCharacter(value: unknown): Character | null {
  if (typeof value !== "object" || value == null) return null;
  const c = value as Record<string, unknown>;

  if (typeof c.id !== "string" || c.id.length === 0) return null;
  if (typeof c.name !== "string" || c.name.trim().length === 0) return null;
  if (!isD4Class(c.class)) return null;
  if (typeof c.updatedAt !== "string") return null;

  return {
    id: c.id,
    name: c.name,
    class: c.class,
    title: typeof c.title === "string" ? c.title : undefined,
    level: typeof c.level === "number" ? c.level : undefined,
    updatedAt: c.updatedAt,
  };
}
