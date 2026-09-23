import { render, screen } from "@testing-library/react-native";

import { PaperDoll } from "./PaperDoll";

it("renders one tile per class slot, empty vs filled", () => {
  const onSlotPress = jest.fn();
  render(
    <PaperDoll
      characterClass="sorcerer"
      items={[{ slot: "helm", name: "Circlet", rarity: "rare" }]}
      onSlotPress={onSlotPress}
    />,
  );
  expect(screen.getByText("Circlet")).toBeTruthy();
  expect(screen.getAllByTestId(/slot-/).length).toBeGreaterThan(1);
});
