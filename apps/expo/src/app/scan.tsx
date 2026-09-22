import { useRef } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { Stack } from "expo-router";

import { scannerConfig } from "~/features/scanner/config";
import { useCharacterScan } from "~/features/scanner/useCharacterScan";

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);
  const { candidates, status, photoPath, error, capture, retake } = useCharacterScan(cameraRef);

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
          className="absolute border-2 border-cyan-400"
          style={{
            left: `${scannerConfig.roi.x * 100}%`,
            top: `${scannerConfig.roi.y * 100}%`,
            width: `${scannerConfig.roi.width * 100}%`,
            height: `${scannerConfig.roi.height * 100}%`,
          }}
        />
      )}
      {(status === "capturing" || status === "processing") && (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <Text className="text-base" style={{ color: "#ffffff" }}>Scanning…</Text>
        </View>
      )}
      {status === "idle" && (
        <View className="absolute inset-x-4 bottom-16 items-center">
          <Pressable
            onPress={() => void capture()}
            className="rounded-full bg-cyan-400 px-6 py-3"
          >
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Take Picture</Text>
          </Pressable>
        </View>
      )}
      {status === "done" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Level: {candidates.level ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Title: {candidates.title ?? "—"}</Text>
          <Text className="mb-3 text-base" style={{ color: "#ffffff" }}>Name: {candidates.name ?? "—"}</Text>
          <Pressable onPress={retake} className="items-center rounded-full bg-cyan-400 px-6 py-3">
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
