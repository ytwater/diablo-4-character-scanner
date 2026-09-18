import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Character } from "./types";

export function CharacterChip({
  character,
  onEdit,
}: {
  character: Character;
  onEdit: () => void;
}) {
  const subtitle = [character.class, character.level != null ? `Lv ${character.level}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable style={styles.chip} onPress={onEdit} hitSlop={8}>
      <View style={styles.textColumn}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {character.name}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.edit}>✎</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  // Lets the name ellipsize instead of shoving the edit glyph out of the chip.
  textColumn: { flex: 1, minWidth: 0 },
  name: { color: "white", fontSize: 16, fontWeight: "600" },
  subtitle: { color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 },
  edit: { color: "white", fontSize: 18 },
});
