import { Pressable, Text, View } from "react-native";

import type { CharacterClass, ItemRarity, ItemSlot } from "@acme/validators";
import { slotsForClass } from "@acme/validators";

import { characterTheme } from "./theme";

// Rough grid layout: armor/jewelry left column, weapons right column.
// Placeholder positions — replace with a real per-class layout map once
// there's a silhouette to align against (design doc: "layout map" is
// out-of-scope-for-v1 detail, this ships the simplest thing that works).
export function PaperDoll(props: {
  characterClass: CharacterClass;
  items: { slot: ItemSlot; name: string; rarity?: ItemRarity }[];
  onSlotPress: (slot: ItemSlot) => void;
}) {
  const slots = slotsForClass(props.characterClass);
  const bySlot = new Map(props.items.map((i) => [i.slot, i]));

  return (
    <View className="flex-row flex-wrap gap-2">
      {slots.map((slot) => {
        const item = bySlot.get(slot);
        const borderColor = item?.rarity
          ? characterTheme.rarity[item.rarity]
          : "#52525b";
        return (
          <Pressable
            key={slot}
            testID={`slot-${slot}`}
            onPress={() => props.onSlotPress(slot)}
            style={{
              width: 96,
              height: 64,
              borderWidth: 2,
              borderColor,
              borderStyle: item ? "solid" : "dashed",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
            }}
          >
            <Text
              style={{ color: item ? borderColor : "#71717a" }}
              numberOfLines={2}
            >
              {item ? item.name : slot}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
