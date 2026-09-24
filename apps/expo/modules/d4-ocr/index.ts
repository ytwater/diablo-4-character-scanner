import { requireNativeModule } from "expo-modules-core";

import type { OcrBlock } from "~/features/scanner/anchor";

export interface Roi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecognizeImageResult {
  blocks: OcrBlock[];
  width: number;
  height: number;
}

interface D4OcrModule {
  /** `scale` > 1 upscales the cropped image before recognition. */
  recognizeImage(uri: string, roi: Roi | null, scale: number): Promise<RecognizeImageResult>;
}

export default requireNativeModule<D4OcrModule>("D4Ocr");
