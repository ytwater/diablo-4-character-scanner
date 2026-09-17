import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";

import type { TextBlock } from "../features/scanner/anchor";
import { findAnchor } from "../features/scanner/anchor";
import { scannerConfig } from "../features/scanner/config";
import { extractFields } from "../features/scanner/fields";
import { useTextScanner } from "../features/scanner/useTextScanner";
import { createFieldVoter } from "../features/scanner/voting";

interface FieldDisplay {
  candidate: string | null;
  locked: string | null;
}

const EMPTY_FIELD: FieldDisplay = { candidate: null, locked: null };

export default function ScanScreen() {
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();

  const nameVoter = useRef(
    createFieldVoter({
      windowSize: scannerConfig.voteWindowSize,
      threshold: scannerConfig.lockThresholds.name,
    }),
  );
  const titleVoter = useRef(
    createFieldVoter({
      windowSize: scannerConfig.voteWindowSize,
      threshold: scannerConfig.lockThresholds.title,
    }),
  );
  const levelVoter = useRef(
    createFieldVoter({
      windowSize: scannerConfig.voteWindowSize,
      threshold: scannerConfig.lockThresholds.level,
    }),
  );

  const [name, setName] = useState<FieldDisplay>(EMPTY_FIELD);
  const [title, setTitle] = useState<FieldDisplay>(EMPTY_FIELD);
  const [level, setLevel] = useState<FieldDisplay>(EMPTY_FIELD);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  const onBlocks = useCallback((blocks: TextBlock[]) => {
    const anchor = findAnchor(blocks);
    if (anchor == null) return;

    const fields = extractFields(blocks, anchor);

    nameVoter.current.vote(fields.name);
    titleVoter.current.vote(fields.title);
    levelVoter.current.vote(fields.level);

    setName({
      candidate: fields.name ?? null,
      locked: nameVoter.current.getLocked(),
    });
    setTitle({
      candidate: fields.title ?? null,
      locked: titleVoter.current.getLocked(),
    });
    setLevel({
      candidate: fields.level ?? null,
      locked: levelVoter.current.getLocked(),
    });
  }, []);

  const frameProcessor = useTextScanner(onBlocks);

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
        isActive={true}
        frameProcessor={frameProcessor}
      />
      <View pointerEvents="none" style={styles.aimBox} />
      <View style={styles.overlay} pointerEvents="none">
        <FieldRow label="Name" field={name} />
        <FieldRow label="Title" field={title} />
        <FieldRow label="Level" field={level} />
      </View>
    </View>
  );
}

function FieldRow({ label, field }: { label: string; field: FieldDisplay }) {
  const locked = field.locked != null;
  const value = field.locked ?? field.candidate ?? "...";

  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}:</Text>
      <Text style={[styles.fieldValue, locked ? styles.fieldValueLocked : styles.fieldValueUnlocked]}>
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
  aimBox: {
    position: "absolute",
    top: "30%",
    left: "10%",
    right: "10%",
    height: "30%",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 8,
  },
  overlay: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 8,
    padding: 12,
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
  },
  fieldValueUnlocked: {
    color: "rgba(255, 255, 255, 0.5)",
  },
  fieldValueLocked: {
    color: "#4ade80",
  },
});
