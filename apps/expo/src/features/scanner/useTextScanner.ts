import { useFrameProcessor, VisionCameraProxy } from "react-native-vision-camera";

const plugin = VisionCameraProxy.initFrameProcessorPlugin("scanText", {});

export interface TextBlock {
  text: string;
  frame: { x: number; y: number; width: number; height: number };
}

export function useTextScanner(onBlocks: (blocks: TextBlock[]) => void) {
  return useFrameProcessor((frame) => {
    "worklet";
    if (plugin == null) {
      console.error("scanText plugin not found");
      return;
    }
    const result = plugin.call(frame) as TextBlock[] | undefined;
    if (result != null) {
      // runOnJS is required here in a later step once onBlocks touches React
      // state -- for this task, a plain console.log proves data flows.
      console.log(`blocks: ${result.length}`);
    }
  }, []);
}
