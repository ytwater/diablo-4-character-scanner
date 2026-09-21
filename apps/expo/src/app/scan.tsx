import { StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { Stack } from "expo-router";

import { scannerConfig } from "~/features/scanner/config";
import { useTextScanner } from "~/features/scanner/useTextScanner";

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const { frameProcessor, candidates } = useTextScanner();

  if (!hasPermission) {
    requestPermission();
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

  return (
    <View className="h-full w-full">
      <Stack.Screen options={{ title: "Scan" }} />
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />
      <View
        className="absolute border-2 border-cyan-400"
        style={{
          left: `${scannerConfig.roi.x * 100}%`,
          top: `${scannerConfig.roi.y * 100}%`,
          width: `${scannerConfig.roi.width * 100}%`,
          height: `${scannerConfig.roi.height * 100}%`,
        }}
      />
      <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
        <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Level: {candidates.level ?? "—"}</Text>
        <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Title: {candidates.title ?? "—"}</Text>
        <Text className="text-base" style={{ color: "#ffffff" }}>Name: {candidates.name ?? "—"}</Text>
      </View>
    </View>
  );
}
