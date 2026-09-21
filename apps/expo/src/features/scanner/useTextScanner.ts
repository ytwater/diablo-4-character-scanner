import { useRef, useState } from "react";
import { useFrameProcessor, VisionCameraProxy } from "react-native-vision-camera";
import { useRunOnJS, useSharedValue } from "react-native-worklets-core";

import type { OcrBlock } from "./anchor";
import { findAnchor } from "./anchor";
import { extractFields } from "./fields";
import { scannerConfig } from "./config";
import { castVote, createVoteState } from "./voting";

const plugin = VisionCameraProxy.initFrameProcessorPlugin("scanText", {});

export interface ScanCandidates {
  level?: string;
  title?: string;
  name?: string;
}

interface PluginResult {
  blocks: OcrBlock[];
  width: number;
  height: number;
}

export function useTextScanner() {
  const [candidates, setCandidates] = useState<ScanCandidates>({});
  const levelVotes = useRef(createVoteState<string>());
  const titleVotes = useRef(createVoteState<string>());
  const nameVotes = useRef(createVoteState<string>());

  const handleResult = (raw: PluginResult | undefined) => {
    if (!raw) return;
    const anchor = findAnchor(
      raw.blocks,
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );
    if (!anchor) return;

    const fields = extractFields(raw.blocks, anchor);
    const { thresholds, windowSize } = scannerConfig.vote;

    levelVotes.current = castVote(levelVotes.current, fields.level?.text, windowSize, thresholds.level);
    titleVotes.current = castVote(titleVotes.current, fields.title?.text, windowSize, thresholds.title);
    nameVotes.current = castVote(nameVotes.current, fields.name?.text, windowSize, thresholds.name);

    setCandidates({
      level: levelVotes.current.locked ?? fields.level?.text,
      title: titleVotes.current.locked ?? fields.title?.text,
      name: nameVotes.current.locked ?? fields.name?.text,
    });
  };

  const handleResultWorklet = useRunOnJS(handleResult, [handleResult]);
  const lastProcessedAt = useSharedValue(0);

  if (plugin == null) {
    throw new Error("Failed to load scanText frame processor plugin - is the d4-ocr module linked?");
  }

  const frameIntervalNs = 1_000_000_000 / scannerConfig.targetFps;

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (frame.timestamp - lastProcessedAt.value < frameIntervalNs) return;
      lastProcessedAt.value = frame.timestamp;

      const result = plugin.call(frame, {
        roiX: scannerConfig.roi.x,
        roiY: scannerConfig.roi.y,
        roiWidth: scannerConfig.roi.width,
        roiHeight: scannerConfig.roi.height,
      }) as unknown as PluginResult | undefined;

      handleResultWorklet(result);
    },
    [handleResultWorklet, lastProcessedAt, frameIntervalNs],
  );

  return { frameProcessor, candidates };
}
