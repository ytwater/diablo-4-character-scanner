// Text/border colors here are applied with inline `style`, never className —
// see the NativeWind color/border quirk noted for this app.
export const characterTheme = {
  background: "#0a0a0f",
  parchment: "#e8dcc0",
  bronzeFrame: "#7a5c34",
  rarity: {
    common: "#c8c8c8",
    magic: "#5bb0f5",
    rare: "#f5e14a",
    legendary: "#f59b42",
    unique: "#c9a86a",
    // Calibrated from an on-device mythic-unique capture (Task 11); matches
    // itemConfig.rarityColors.mythicUnique.
    mythicUnique: "#d193b6",
  },
} as const;
