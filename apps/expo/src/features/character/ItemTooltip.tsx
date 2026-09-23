import { Text, View } from "react-native";

import type { ItemLine, ItemRarity } from "@acme/validators";

import { characterTheme } from "./theme";

export function ItemTooltip(props: {
  item: {
    name: string;
    rarity?: ItemRarity;
    typeLine?: string;
    lines: ItemLine[];
  };
}) {
  const rarityColor = props.item.rarity
    ? characterTheme.rarity[props.item.rarity]
    : characterTheme.parchment;

  return (
    <View
      style={{
        backgroundColor: characterTheme.background,
        borderTopWidth: 3,
        borderTopColor: rarityColor,
        borderColor: characterTheme.bronzeFrame,
        borderWidth: 1,
        padding: 12,
        gap: 4,
      }}
    >
      <Text
        style={{ color: rarityColor, fontFamily: "Cinzel_700Bold", fontSize: 18 }}
      >
        {props.item.name}
      </Text>
      {props.item.typeLine && (
        <Text
          style={{ color: rarityColor, fontFamily: "AlegreyaSans_400Regular" }}
        >
          {props.item.typeLine}
        </Text>
      )}
      {props.item.lines.map((line, i) => (
        <Text
          key={i}
          style={{
            color:
              line.kind === "aspect"
                ? characterTheme.rarity.legendary
                : characterTheme.parchment,
            fontStyle: line.kind === "aspect" ? "italic" : "normal",
            fontFamily: "AlegreyaSans_400Regular",
          }}
        >
          {line.kind === "affix" ? "◆ " : ""}
          {line.kind === "socket" ? "◇ " : ""}
          {line.text}
        </Text>
      ))}
    </View>
  );
}
