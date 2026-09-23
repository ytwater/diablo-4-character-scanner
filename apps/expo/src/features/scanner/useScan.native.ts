import { useRef, useState } from "react";
import { File } from "expo-file-system";
import type { Camera } from "react-native-vision-camera";

import type { CharacterCandidates, ItemCandidates, ScanMode } from "@acme/validators";

import D4Ocr from "../../../modules/d4-ocr";
import type { OcrBlock } from "./anchor";
import { findAnchor } from "./anchor";
import { extractFields } from "./fields";
import { extractItemFields } from "./itemFields";
import { classifyRarity } from "./rarity";
import { itemConfig, scannerConfig } from "./config";

export type ScanStatus = "idle" | "capturing" | "processing" | "done" | "error";

export type { ScanMode, CharacterCandidates, ItemCandidates };

export function useScan(mode: ScanMode, cameraRef: React.RefObject<Camera | null>) {
  const [candidates, setCandidates] = useState<CharacterCandidates | ItemCandidates>({});
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [photoPath, setPhotoPath] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  // Raw OCR blocks from the last item-mode scan (undefined in character
  // mode) - exposed so classifyLines can run against real per-block
  // text/frame/color data instead of the flat candidates.affixes strings.
  const [blocks, setBlocks] = useState<OcrBlock[] | undefined>();
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

      if (mode === "character") {
        const result = await D4Ocr.recognizeImage(uri, scannerConfig.roi);
        const anchor = findAnchor(result.blocks, scannerConfig.anchorText, scannerConfig.anchorFuzzyThreshold);
        const fields = anchor ? extractFields(result.blocks, anchor) : {};
        setCandidates({
          level: fields.level?.text,
          title: fields.title?.text,
          name: fields.name?.text,
        });
      } else {
        const result = await D4Ocr.recognizeImage(uri, itemConfig.roi);
        const fields = extractItemFields(result.blocks);
        // The type line ("Rare Helm") and the item name are both rendered in
        // the item's rarity color - the type line uses a plainer font, so it
        // gives a more consistent color sample.
        const rarityColor = fields.type?.color ?? fields.name?.color;
        setCandidates({
          name: fields.name?.text,
          type: fields.type?.text,
          affixes: fields.affixes,
          rarity: rarityColor ? classifyRarity(rarityColor) : undefined,
        });
        setBlocks(result.blocks);
      }
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
    setCandidates(mode === "item" ? { affixes: [] } : {});
    setBlocks(undefined);
    setError(undefined);
    setStatus("idle");
  };

  return { candidates, status, photoPath, error, blocks, capture, retake };
}
