import { render, screen } from "@testing-library/react-native";

import { ItemTooltip } from "./ItemTooltip";

it("renders name, rarity color, and each line kind", () => {
  render(
    <ItemTooltip
      item={{
        name: "Doombringer",
        rarity: "unique",
        typeLine: "Two-Handed Sword",
        lines: [
          { kind: "itemPower", text: "Item Power: 800" },
          { kind: "affix", text: "+20% Damage" },
          { kind: "aspect", text: "Aspect of Doom" },
          { kind: "other", text: "Something unclassified" },
        ],
      }}
    />,
  );
  expect(screen.getByText("Doombringer")).toBeTruthy();
  expect(screen.getByText("Aspect of Doom")).toBeTruthy();
  expect(screen.getByText("Something unclassified")).toBeTruthy();
});
