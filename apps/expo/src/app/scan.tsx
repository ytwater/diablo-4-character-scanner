import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera";

import type { TextBlock } from "../features/scanner/anchor";
import type { ScanMode } from "../features/scanner/detect-mode";
import type { VotedItem } from "../features/scanner/item-voting";
import { findAnchor } from "../features/scanner/anchor";
import { CharacterChip } from "../features/character/CharacterChip";
import { CharacterSetup } from "../features/character/CharacterSetup";
import { nextCharacterFromLock } from "../features/character/level-writeback";
import { useCharacter } from "../features/character/useCharacter";
import { scannerConfig } from "../features/scanner/config";
import { detectMode } from "../features/scanner/detect-mode";
import { extractFields } from "../features/scanner/fields";
import { parseItem } from "../features/scanner/item-parser";
import { createItemVoter } from "../features/scanner/item-voting";
import { useTextScanner } from "../features/scanner/useTextScanner";
import { createFieldVoter } from "../features/scanner/voting";
import { isSameReading } from "../features/scanner/text-distance";

interface FieldDisplay {
  candidate: string | null;
  locked: string | null;
}

const EMPTY_FIELD: FieldDisplay = { candidate: null, locked: null };

/**
 * How many consecutive frames must disagree with the accumulated item name
 * before we assume the user has aimed at a different item and start over.
 * A couple of stray frames shouldn't discard a good scan.
 */
const ITEM_SWITCH_FRAMES = 4;

export default function ScanScreen() {
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();

  // VisionCamera's default analysis resolution is 640x480, which is why the
  // camera had to be held close for text to be legible. The frame processor's
  // resolution comes from the format's videoSize, so request a much larger
  // one. runAsync already decoupled OCR from the preview, so paying more per
  // frame costs scan rate, not smoothness.
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1920, height: 1080 } },
  ]);

  const { character, isLoading, save, clear } = useCharacter();
  const [isEditing, setIsEditing] = useState(false);

  const levelVoter = useRef(
    createFieldVoter({
      windowSize: scannerConfig.voteWindowSize,
      threshold: scannerConfig.lockThresholds.level,
    }),
  );
  const itemVoter = useRef(createItemVoter());
  const mismatchCount = useRef(0);

  const [mode, setMode] = useState<ScanMode>("none");
  const [level, setLevel] = useState<FieldDisplay>(EMPTY_FIELD);
  const [item, setItem] = useState<VotedItem | null>(null);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  const resetItem = useCallback(() => {
    itemVoter.current.reset();
    mismatchCount.current = 0;
    setItem(null);
  }, []);

  const onBlocks = useCallback((blocks: TextBlock[]) => {
    const detected = detectMode(blocks);
    setMode(detected);

    if (detected === "item") {
      const parsed = parseItem(blocks.map((b) => b.text).join("\n"));

      // Aiming at a different item should start a fresh scan rather than
      // blending two items' affixes together.
      const current = itemVoter.current.getResult().name;
      if (parsed.name != null && current != null && !isSameReading(parsed.name, current)) {
        mismatchCount.current += 1;
        if (mismatchCount.current >= ITEM_SWITCH_FRAMES) {
          itemVoter.current.reset();
          mismatchCount.current = 0;
        }
      } else {
        mismatchCount.current = 0;
      }

      itemVoter.current.observe(parsed);
      setItem(itemVoter.current.getResult());
      return;
    }

    if (detected === "character") {
      const anchor = findAnchor(blocks);
      if (anchor == null) return;

      const fields = extractFields(blocks, anchor);
      levelVoter.current.vote(fields.level);

      // Show the voter's front-runner rather than this frame's raw read, so
      // the display reflects accumulating agreement instead of flickering
      // with every frame's OCR jitter.
      setLevel({
        candidate: levelVoter.current.getLeading(),
        locked: levelVoter.current.getLocked(),
      });
    }
  }, []);

  const frameProcessor = useTextScanner(onBlocks);

  // Write the locked level back to the stored profile. This must be an
  // effect rather than inline in onBlocks: onBlocks runs from the frame-
  // processor callback where `character` would be captured stale.
  useEffect(() => {
    if (character == null) return;
    const next = nextCharacterFromLock(character, level.locked);
    if (next != null) void save(next);
  }, [character, level.locked, save]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Scan" }} />
        <Text style={styles.dim}>Loading…</Text>
      </View>
    );
  }

  if (character == null || isEditing) {
    return (
      <View style={styles.fill}>
        <Stack.Screen options={{ title: character == null ? "Set up" : "Edit" }} />
        <CharacterSetup
          existing={character}
          onSave={async (next) => {
            await save(next);
            setIsEditing(false);
          }}
          onCancel={character != null ? () => setIsEditing(false) : undefined}
          onClear={
            character != null
              ? async () => {
                  await clear();
                  setIsEditing(false);
                }
              : undefined
          }
        />
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>Camera permission required</Text>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>No camera device found</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: "Scan" }} />
      <Camera
        style={styles.fill}
        device={device}
        format={format}
        isActive={true}
        frameProcessor={frameProcessor}
        // Ask CameraX for RGBA_8888 rather than the default YUV_420_888.
        // ML Kit's YUV->NV21 conversion runs in managed code and dominated
        // frame cost; RGB lets CameraX do that conversion natively and lets
        // the plugin use ML Kit's fast fromBitmap path.
        pixelFormat="rgb"
      />
      <CharacterChip character={character} onEdit={() => setIsEditing(true)} />
      <View pointerEvents="none" style={styles.aimBox} />

      <View style={styles.overlay}>
        <View style={styles.modeRow}>
          <Text style={styles.modeLabel}>
            {mode === "item"
              ? "Item"
              : mode === "character"
                ? "Character sheet"
                : "Point at a character sheet or item"}
          </Text>
          {mode === "item" && (
            <Pressable onPress={resetItem} hitSlop={8}>
              <Text style={styles.resetButton}>Reset</Text>
            </Pressable>
          )}
        </View>

        {mode === "item" ? (
          <ItemView item={item} />
        ) : (
          <FieldRow label="Level" field={level} />
        )}
      </View>
    </View>
  );
}

function ItemView({ item }: { item: VotedItem | null }) {
  if (item == null) {
    return <Text style={styles.dim}>Reading…</Text>;
  }

  const subtitle = [item.rarity, item.slot].filter(Boolean).join(" ");

  return (
    <ScrollView style={styles.itemScroll}>
      <Text style={styles.itemName}>{item.name ?? "…"}</Text>
      {subtitle.length > 0 && <Text style={styles.dim}>{subtitle}</Text>}

      {item.itemPower != null && (
        <Text style={styles.itemPower}>{item.itemPower} Item Power</Text>
      )}
      {item.primary != null && (
        <Text style={styles.itemPrimary}>
          {item.primary.value.toLocaleString()} {item.primary.label}
        </Text>
      )}

      {item.affixes.map((affix) => (
        <Text key={affix.stat} style={styles.affix}>
          {affix.isPercent
            ? `+${affix.value}% ${affix.stat}`
            : `+${affix.value.toLocaleString()} ${affix.stat}`}
          {affix.range != null && (
            <Text style={styles.dim}>
              {`  [${affix.range.min.toLocaleString()} – ${affix.range.max.toLocaleString()}]`}
            </Text>
          )}
        </Text>
      ))}

      {item.needsScroll && (
        <Text style={styles.warning}>
          Tooltip is cut off — scroll down in game to capture the rest
        </Text>
      )}

      <Text style={styles.footer}>
        {[
          item.requiresLevel != null ? `Requires level ${item.requiresLevel}` : null,
          item.sellValue != null ? `Sells for ${item.sellValue.toLocaleString()}` : null,
          `${item.framesSeen} frames`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </ScrollView>
  );
}

function FieldRow({ label, field }: { label: string; field: FieldDisplay }) {
  const locked = field.locked != null;
  const value = field.locked ?? field.candidate ?? "...";

  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}:</Text>
      <Text
        style={[
          styles.fieldValue,
          locked ? styles.fieldValueLocked : styles.fieldValueUnlocked,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "black",
  },
  fill: {
    flex: 1,
    backgroundColor: "black",
  },
  text: {
    color: "white",
  },
  dim: {
    color: "rgba(255, 255, 255, 0.55)",
  },
  aimBox: {
    position: "absolute",
    top: "12%",
    left: "8%",
    right: "8%",
    height: "40%",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 8,
  },
  overlay: {
    position: "absolute",
    bottom: 24,
    left: 12,
    right: 12,
    maxHeight: "48%",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderRadius: 10,
    padding: 12,
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  modeLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  resetButton: {
    color: "#60a5fa",
    fontWeight: "600",
  },
  itemScroll: {
    maxHeight: "100%",
  },
  itemName: {
    color: "#fbbf24",
    fontSize: 18,
    fontWeight: "700",
  },
  itemPower: {
    color: "white",
    marginTop: 4,
  },
  itemPrimary: {
    color: "white",
    fontWeight: "600",
    marginTop: 4,
    marginBottom: 2,
  },
  affix: {
    color: "#e5e7eb",
    marginTop: 2,
  },
  warning: {
    color: "#fbbf24",
    marginTop: 8,
    fontStyle: "italic",
  },
  footer: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    marginTop: 8,
  },
  fieldRow: {
    flexDirection: "row",
    marginVertical: 2,
  },
  fieldLabel: {
    color: "white",
    fontWeight: "600",
    width: 60,
  },
  fieldValue: {
    fontWeight: "600",
    flexShrink: 1,
  },
  fieldValueUnlocked: {
    color: "rgba(255, 255, 255, 0.5)",
  },
  fieldValueLocked: {
    color: "#4ade80",
  },
});
