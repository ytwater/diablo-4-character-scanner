import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { Stack } from "expo-router";

import { itemConfig, scannerConfig } from "~/features/scanner/config";
import { useScan } from "~/features/scanner/useScan";
import type { CharacterCandidates, ItemCandidates, ScanMode } from "~/features/scanner/useScan";

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);
  const [mode, setMode] = useState<ScanMode>("character");
  const { candidates, status, photoPath, error, capture, retake } = useScan(mode, cameraRef);

  if (!hasPermission) {
    void requestPermission();
    return (
      <View className="bg-background h-full w-full items-center justify-center">
        <Stack.Screen options={{ title: "Scan" }} />
        <Text className="text-foreground">Requesting camera permission…</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View className="bg-background h-full w-full items-center justify-center">
        <Stack.Screen options={{ title: "Scan" }} />
        <Text className="text-foreground">No camera device found.</Text>
      </View>
    );
  }

  const showPhoto = status !== "idle" && photoPath;
  const characterCandidates = candidates as CharacterCandidates;
  const itemCandidates = candidates as ItemCandidates;
  const roi = mode === "character" ? scannerConfig.roi : itemConfig.roi;

  return (
    <View className="h-full w-full">
      <Stack.Screen options={{ title: "Scan" }} />
      {showPhoto ? (
        <Image source={{ uri: photoPath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive={true} photo={true} />
      )}
      {status === "idle" && (
        <View
          className="absolute"
          style={{
            left: `${roi.x * 100}%`,
            top: `${roi.y * 100}%`,
            width: `${roi.width * 100}%`,
            height: `${roi.height * 100}%`,
            borderWidth: 2,
            borderColor: "#22d3ee",
          }}
        />
      )}
      {(status === "capturing" || status === "processing") && (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <Text className="text-base" style={{ color: "#ffffff" }}>Scanning…</Text>
        </View>
      )}
      {status === "idle" && (
        <View className="absolute inset-x-4 top-4 flex-row justify-center gap-2">
          {(["character", "item"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: mode === m ? "#22d3ee" : "rgba(0,0,0,0.5)" }}
            >
              <Text
                className="text-sm font-semibold capitalize"
                style={{ color: mode === m ? "#000000" : "#ffffff" }}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {status === "idle" && (
        <View className="absolute inset-x-4 bottom-16 items-center">
          <Pressable onPress={() => void capture()} className="rounded-full bg-cyan-400 px-6 py-3">
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Take Picture</Text>
          </Pressable>
        </View>
      )}
      {status === "done" && mode === "character" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Level: {characterCandidates.level ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Title: {characterCandidates.title ?? "—"}</Text>
          <Text className="mb-3 text-base" style={{ color: "#ffffff" }}>Name: {characterCandidates.name ?? "—"}</Text>
          <Pressable onPress={retake} className="items-center rounded-full bg-cyan-400 px-6 py-3">
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Retake</Text>
          </Pressable>
        </View>
      )}
      {status === "done" && mode === "item" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Name: {itemCandidates.name ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Rarity: {itemCandidates.rarity ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Type: {itemCandidates.type ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Affixes:</Text>
          {itemCandidates.affixes.length === 0 ? (
            <Text className="mb-3 text-base" style={{ color: "#ffffff" }}>—</Text>
          ) : (
            itemCandidates.affixes.map((affix, i) => (
              <Text key={i} className="mb-1 text-base" style={{ color: "#ffffff" }}>{affix}</Text>
            ))
          )}
          <Pressable onPress={retake} className="mt-2 items-center rounded-full bg-cyan-400 px-6 py-3">
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Retake</Text>
          </Pressable>
        </View>
      )}
      {status === "error" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text className="mb-3 text-base" style={{ color: "#ffffff" }}>Error: {error}</Text>
          <Pressable onPress={retake} className="items-center rounded-full bg-cyan-400 px-6 py-3">
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Retake</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
