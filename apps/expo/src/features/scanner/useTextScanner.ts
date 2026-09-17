import {
  runAtTargetFps,
  useFrameProcessor,
  VisionCameraProxy,
} from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";

import { scannerConfig } from "./config";

const plugin = VisionCameraProxy.initFrameProcessorPlugin("scanText", {});

export interface TextBlock {
  text: string;
  frame: { x: number; y: number; width: number; height: number };
}

export function useTextScanner(onBlocks: (blocks: TextBlock[]) => void) {
  // react-native-worklets-core 1.6.3 doesn't export a bare `runOnJS` --
  // `useRunOnJS` is the current API for hopping from a worklet back to the
  // JS thread. It returns a memoized Worklet we can safely call from the
  // frame processor below.
  const runOnJS = useRunOnJS(onBlocks, [onBlocks]);

  return useFrameProcessor((frame) => {
    "worklet";
    // The scanText plugin's ML Kit call is synchronous and costs ~500-700ms
    // per invocation -- far slower than the ~30fps the camera delivers frames
    // at (Phase 1). Without throttling, VisionCamera dispatches the frame
    // processor on every frame regardless of whether the previous call
    // finished, and a synchronous native call that slow backs up badly,
    // which is what made the live preview "pretty much unusable" before this
    // was added. runAtTargetFps skips the expensive call on frames beyond the
    // target rate instead of letting them queue.
    runAtTargetFps(scannerConfig.targetFps, () => {
      "worklet";
      if (plugin == null) {
        console.error("scanText plugin not found");
        return;
      }
      const result = plugin.call(frame) as TextBlock[] | undefined;
      if (result != null) {
        void runOnJS(result);
      }
    });
  }, [runOnJS]);
}
