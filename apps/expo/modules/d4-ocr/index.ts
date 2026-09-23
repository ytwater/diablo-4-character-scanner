import { requireNativeModule } from "expo-modules-core";

import type { OcrBlock } from "~/features/scanner/anchor";

export interface Roi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface RecognizeImageResult {
  blocks: OcrBlock[];
  width: number;
  height: number;
  topBlockColor?: Rgb;
}

interface D4OcrModule {
  recognizeImage(uri: string, roi: Roi | null): Promise<RecognizeImageResult>;
}

export default requireNativeModule<D4OcrModule>("D4Ocr");
