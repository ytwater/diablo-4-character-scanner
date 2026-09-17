import {
  runAsync,
  useFrameProcessor,
  VisionCameraProxy,
} from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";

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
    // The scanText plugin's ML Kit call is far slower than the camera's frame
    // interval. That matters more than it normally would, because VisionCamera
    // configures CameraX with STRATEGY_BLOCK_PRODUCER
    // (CameraSession+Configuration.kt) -- a slow analyzer back-pressures the
    // camera itself rather than dropping frames, and since preview and
    // analysis share one repeating capture request, that stalls the *preview*.
    // This is what made the live screen lag, and why throttling the call rate
    // with runAtTargetFps didn't fix it: the blocking call still occupied the
    // analysis pipeline whenever it ran.
    //
    // runAsync is VisionCamera's sanctioned answer for exactly this (its own
    // docs use a ~500ms ML plugin as the example). The frame processor returns
    // immediately, the heavy work runs on a separate context, and runAsync
    // drops frames while busy -- so at most one camera buffer is held at a
    // time and the preview keeps running at full rate. It also self-limits to
    // whatever rate ML Kit can actually sustain, so no separate fps throttle
    // is needed.
    runAsync(frame, () => {
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
