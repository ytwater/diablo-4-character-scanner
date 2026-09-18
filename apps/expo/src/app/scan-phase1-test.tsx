import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from "react-native-vision-camera";
import { runOnJS } from "react-native-worklets-core";

export default function ScanPhase1Test() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameSize, setLastFrameSize] = useState("");

  const updateFromJs = useCallback((count: number, size: string) => {
    setFrameCount(count);
    setLastFrameSize(size);
    // eslint-disable-next-line no-console -- phase 1 smoke screen, removed in Task 5
    console.log(`[scan-phase1-test] frame ts=${count} size=${size}`);
  }, []);

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    runOnJS(updateFromJs)(frame.timestamp, `${frame.width}x${frame.height}`);
  }, [updateFromJs]);

  if (!hasPermission) {
    requestPermission();
    return (
      <View style={styles.center}>
        <Text>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Text>No camera device found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>frame ts: {frameCount}</Text>
        <Text style={styles.overlayText}>size: {lastFrameSize}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overlay: {
    position: "absolute",
    top: 60,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 8,
  },
  overlayText: { color: "white" },
});
