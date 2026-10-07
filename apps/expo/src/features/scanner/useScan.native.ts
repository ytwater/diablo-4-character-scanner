import type { Camera } from "react-native-vision-camera";
import { useRef, useState } from "react";
import { File } from "expo-file-system";

import type {
  CharacterCandidates,
  ItemCandidates,
  ScanMode,
} from "@acme/validators";

import type { OcrBlock } from "./anchor";
import D4Ocr from "../../../modules/d4-ocr";
import { findAnchor } from "./anchor";
import { itemConfig, scannerConfig } from "./config";
import { extractFields, findLevelBadgeRegion, pickBadgeLevel } from "./fields";
import { extractItemFields } from "./itemFields";
import { correctItemName } from "./itemName";
import { classifyRarity, parseRarityFromAnyLine } from "./rarity";
import { blocksInFrame, findTooltipFrame } from "./tooltipFrame";

function blocksInRoi(
  blocks: OcrBlock[],
  width: number,
  height: number,
  roi: { x: number; y: number; width: number; height: number },
): OcrBlock[] {
  const left = roi.x * width;
  const top = roi.y * height;
  const right = (roi.x + roi.width) * width;
  const bottom = (roi.y + roi.height) * height;
  return blocks.filter(
    (b) =>
      b.frame.x >= left &&
      b.frame.y >= top &&
      b.frame.x + b.frame.width <= right &&
      b.frame.y + b.frame.height <= bottom,
  );
}

export type ScanStatus = "idle" | "capturing" | "processing" | "done" | "error";

export type { ScanMode, CharacterCandidates, ItemCandidates };

export function useScan(
  mode: ScanMode,
  cameraRef: React.RefObject<Camera | null>,
) {
  const [candidates, setCandidates] = useState<
    CharacterCandidates | ItemCandidates
  >({});
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

      const uri = photo.path.startsWith("file://")
        ? photo.path
        : `file://${photo.path}`;
      photoFileRef.current = new File(uri);
      setPhotoPath(uri);
      setStatus("processing");

      if (mode === "character") {
        // OCR the whole photo rather than a fixed ROI, so the result doesn't
        // depend on framing: the "CHARACTER" header anchors the fields, and
        // extractFields only looks in the panel's column under it.
        const result = await D4Ocr.recognizeImage(uri, null, 1);
        const anchor = findAnchor(
          result.blocks,
          scannerConfig.anchorText,
          scannerConfig.anchorFuzzyThreshold,
        );
        const fields = anchor ? extractFields(result.blocks, anchor) : {};

        // ML Kit often misses the small level badge in the first pass. Re-OCR
        // just the badge region, then the same region upscaled 3x.
        let level = fields.level;
        const badge =
          anchor && fields.name
            ? findLevelBadgeRegion(anchor, fields.name)
            : undefined;
        if (!level && badge) {
          // Badge region is in photo pixels; recognizeImage takes a ROI
          // normalized to the photo.
          const left = Math.max(0, badge.x / result.width);
          const top = Math.max(0, badge.y / result.height);
          const right = Math.min(1, (badge.x + badge.width) / result.width);
          const bottom = Math.min(1, (badge.y + badge.height) / result.height);
          if (right > left && bottom > top) {
            const badgeRoi = {
              x: left,
              y: top,
              width: right - left,
              height: bottom - top,
            };
            for (const scale of [1, 3]) {
              const pass = await D4Ocr.recognizeImage(uri, badgeRoi, scale);
              level = pickBadgeLevel(pass.blocks);
              if (level) break;
            }
          }
        }

        setCandidates({
          level: level?.text,
          title: fields.title?.text,
          name: fields.name?.text,
        });
      } else {
        // OCR the whole photo, then bound the tooltip by its EQUIPPED header
        // and Unequip action - far tighter than any fixed ROI, and it
        // doesn't depend on how the user framed the shot. Fall back to the
        // fixed ROI region when the header isn't found (e.g. a non-equipped
        // item's tooltip).
        const result = await D4Ocr.recognizeImage(uri, null, 1);
        const frame = findTooltipFrame(
          result.blocks,
          result.width,
          result.height,
        );
        const tooltipBlocks = frame
          ? blocksInFrame(result.blocks, frame)
          : blocksInRoi(
              result.blocks,
              result.width,
              result.height,
              itemConfig.roi,
            );
        const fields = extractItemFields(tooltipBlocks);
        // The type line ("Rare Helm") and the item name are both rendered in
        // the item's rarity color - the type line uses a plainer font, so it
        // gives a more consistent color sample.
        const rarityColor = fields.type?.color ?? fields.name?.color;
        // Task 11 calibration aid — read this in logcat while scanning each
        // rarity to tune itemConfig.rarityColors/rarityColorThreshold, then
        // remove it.
        if (rarityColor) {
          const hex = `#${[rarityColor.r, rarityColor.g, rarityColor.b]
            .map((c) => c.toString(16).padStart(2, "0"))
            .join("")}`;
          console.log("[rarity-calibration] sampled color", hex, rarityColor);
        }
        // The type line spells the rarity out in plain text ("Unique Ring") -
        // far more reliable than the sampled color. Also check the name and
        // affix lines in case name/type-line detection got confused by a bad
        // capture and the rarity word landed somewhere else; sampled color
        // stays as the last-resort fallback.
        const rarity =
          parseRarityFromAnyLine([
            fields.type?.text,
            fields.name?.text,
            ...fields.affixes,
          ]) ?? (rarityColor ? classifyRarity(rarityColor) : undefined);
        setCandidates({
          // ML Kit drops/misreads glyphs of the item-name font - snap the
          // name to known unique names and item-name words from game data.
          name:
            fields.name && correctItemName(fields.name.text, fields.type?.text),
          type: fields.type?.text,
          affixes: fields.affixes,
          rarity,
        });
        setBlocks(fields.affixBlocks);
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
