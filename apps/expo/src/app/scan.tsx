import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from "react-native-vision-camera";

export default function ScanScreen() {
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  // Phase 1 pass condition: frames reaching a worklet on device. Deliberately
  // does nothing but report geometry -- no OCR, nothing that could fail for its
  // own reasons.
  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    console.log(`frame ${frame.width}x${frame.height} ${frame.pixelFormat}`);
  }, []);

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
});
