import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { Character, D4Class } from "./types";
import { createCharacter, D4_CLASSES, MAX_NAME_LENGTH } from "./types";

interface Props {
  existing: Character | null;
  onSave: (character: Character) => Promise<void>;
  onClear?: () => Promise<void>;
  onCancel?: () => void;
}

export function CharacterSetup({ existing, onSave, onClear, onCancel }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [klass, setKlass] = useState<D4Class | null>(existing?.class ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = name.trim().length > 0 && klass != null && !isSaving;

  async function submit() {
    if (klass == null) return;
    setIsSaving(true);
    setError(null);

    try {
      // Editing keeps the existing id so a future backend sees one character
      // updated rather than a new one created.
      const next: Character = existing
        ? {
            ...existing,
            name: name.trim().slice(0, MAX_NAME_LENGTH),
            class: klass,
            title: title.trim() || undefined,
            updatedAt: new Date().toISOString(),
          }
        : createCharacter({ name, class: klass, title });

      await onSave(next);
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>
        {existing ? "Edit character" : "Who are you playing?"}
      </Text>

      <Text style={styles.label}>Character name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Thornwyn the Undying"
        placeholderTextColor="rgba(255,255,255,0.35)"
        maxLength={MAX_NAME_LENGTH}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <Text style={styles.label}>Class</Text>
      {D4_CLASSES.map((c) => (
        <Pressable
          key={c}
          style={[styles.classRow, klass === c && styles.classRowSelected]}
          onPress={() => setKlass(c)}
        >
          <Text style={styles.classText}>{c}</Text>
          {klass === c && <Text style={styles.classText}>✓</Text>}
        </Pressable>
      ))}

      <Text style={styles.label}>Title (optional)</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Demonic Defender"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCorrect={false}
      />

      {error != null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
        disabled={!canSubmit}
        onPress={() => void submit()}
      >
        <Text style={styles.primaryButtonText}>
          {isSaving ? "Saving…" : existing ? "Save" : "Start scanning"}
        </Text>
      </Pressable>

      {onCancel != null && (
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      )}

      {onClear != null && (
        <Pressable style={styles.secondaryButton} onPress={() => void onClear()}>
          <Text style={styles.dangerText}>Clear character</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: "black", flexGrow: 1 },
  heading: { color: "white", fontSize: 22, fontWeight: "600", marginBottom: 8 },
  label: { color: "rgba(255,255,255,0.55)", marginTop: 12 },
  input: {
    color: "white",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  classRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  classRowSelected: { borderColor: "white", backgroundColor: "rgba(255,255,255,0.08)" },
  classText: { color: "white", fontSize: 16 },
  primaryButton: {
    marginTop: 24,
    backgroundColor: "white",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: "black", fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.35 },
  secondaryButton: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  secondaryButtonText: { color: "rgba(255,255,255,0.7)" },
  dangerText: { color: "#ff6b6b" },
  error: { color: "#ff6b6b", marginTop: 12 },
});
