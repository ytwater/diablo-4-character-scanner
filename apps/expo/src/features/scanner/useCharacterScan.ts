import { useRef, useState } from "react";
import { File } from "expo-file-system";
import type { Camera } from "react-native-vision-camera";

import D4Ocr from "../../../modules/d4-ocr";
import { findAnchor } from "./anchor";
import { extractFields } from "./fields";
import { scannerConfig } from "./config";

export interface ScanCandidates {
  level?: string;
  title?: string;
  name?: string;
}

export type ScanStatus = "idle" | "capturing" | "processing" | "done" | "error";

export function useCharacterScan(cameraRef: React.RefObject<Camera | null>) {
  const [candidates, setCandidates] = useState<ScanCandidates>({});
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [photoPath, setPhotoPath] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const photoFileRef = useRef<File | undefined>(undefined);

  const capture = async () => {
    setStatus("capturing");
    setError(undefined);
    try {
      const photo = await cameraRef.current?.takePhoto();
      if (!photo) throw new Error("takePhoto() returned no result");

      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      photoFileRef.current = new File(uri);
      setPhotoPath(uri);
      setStatus("processing");

      const result = await D4Ocr.recognizeImage(uri, scannerConfig.roi);
      const anchor = findAnchor(result.blocks, scannerConfig.anchorText, scannerConfig.anchorFuzzyThreshold);
      const fields = anchor ? extractFields(result.blocks, anchor) : {};

      setCandidates({
        level: fields.level?.text,
        title: fields.title?.text,
        name: fields.name?.text,
      });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const retake = () => {
    if (photoFileRef.current?.exists) {
      photoFileRef.current.delete();
    }
    photoFileRef.current = undefined;
    setPhotoPath(undefined);
    setCandidates({});
    setError(undefined);
    setStatus("idle");
  };

  return { candidates, status, photoPath, error, capture, retake };
}
