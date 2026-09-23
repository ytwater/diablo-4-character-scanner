# Item Scanning Implementation Plan

> **For Claude:** Execute this plan task-by-task, directly in this session (no worktree, no handoff). Run the listed test/build command after each implementation step before moving on. Commit after each task.

**Goal:** Add an "Item" mode to `/scan` that captures a single item tooltip and extracts name, rarity, type/slot, and a raw affix list, per `docs/plans/2026-09-22-item-scanning-design.md`.

**Architecture:** Two new pure-function modules (`itemFields.ts`, `rarity.ts`) mirror the existing `fields.ts` pattern. `D4OcrModule.kt` gains an optional ROI (null = full-frame, no crop) and always returns a `topBlockColor` RGB sample. `useCharacterScan` generalizes into `useScan(mode, cameraRef)`, and `scan.tsx` gets a mode toggle plus a second results view.

**Tech Stack:** TypeScript/React Native (Jest for unit tests), Kotlin (Android, on-device verification only — no local Kotlin test runner in this environment).

---

### Task 1: Add `itemConfig` to `config.ts`

**Files:**
- Modify: `apps/expo/src/features/scanner/config.ts`

**Step 1: Add the config block**

Append to the file, after `scannerConfig`:

```ts
export const itemConfig = {
  // Approximate Diablo 4 rarity text colors - placeholder values, needs
  // on-device calibration against real item-tooltip captures.
  rarityColors: {
    common: "#c8c8c8",
    magic: "#5bb0f5",
    rare: "#f5e14a",
    legendary: "#f59b42",
    unique: "#c9a86a",
  },
  // Max Euclidean RGB distance to accept a rarity color match.
  rarityColorThreshold: 40,
} as const;

export type ItemConfig = typeof itemConfig;
```

This is inert data (no logic), so there's no test for this step — it's exercised indirectly by `rarity.test.ts` in Task 3.

**Step 2: Typecheck**

Run: `pnpm --filter expo typecheck`
Expected: no errors.

**Step 3: Commit**

```bash
git add apps/expo/src/features/scanner/config.ts
git commit -m "feat: add itemConfig rarity color table"
```

---

### Task 2: `itemFields.ts` (TDD)

**Files:**
- Create: `apps/expo/src/features/scanner/itemFields.ts`
- Create: `apps/expo/src/features/scanner/itemFields.test.ts`

**Step 1: Write the failing test**

```ts
import { extractItemFields } from "./itemFields";
import type { OcrBlock } from "./anchor";

function block(text: string, y: number): OcrBlock {
  return { text, confidence: 1, frame: { x: 0, y, width: 100, height: 20 } };
}

describe("extractItemFields", () => {
  it("takes the topmost block as name, next as type, rest as affixes", () => {
    const blocks = [
      block("Silent Crown", 10),
      block("Head", 40),
      block("+120 Strength", 70),
      block("12% Damage Reduction", 100),
    ];

    const result = extractItemFields(blocks);

    expect(result.name?.text).toBe("Silent Crown");
    expect(result.type?.text).toBe("Head");
    expect(result.affixes).toEqual(["+120 Strength", "12% Damage Reduction"]);
  });

  it("sorts out-of-order blocks by y-position first", () => {
    const blocks = [block("+120 Strength", 70), block("Silent Crown", 10), block("Head", 40)];

    const result = extractItemFields(blocks);

    expect(result.name?.text).toBe("Silent Crown");
    expect(result.type?.text).toBe("Head");
    expect(result.affixes).toEqual(["+120 Strength"]);
  });

  it("returns empty/undefined fields for an empty block list", () => {
    const result = extractItemFields([]);

    expect(result.name).toBeUndefined();
    expect(result.type).toBeUndefined();
    expect(result.affixes).toEqual([]);
  });

  it("handles a single block (name only, no type/affixes)", () => {
    const result = extractItemFields([block("Silent Crown", 10)]);

    expect(result.name?.text).toBe("Silent Crown");
    expect(result.type).toBeUndefined();
    expect(result.affixes).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter expo test itemFields`
Expected: FAIL — `Cannot find module './itemFields'`.

**Step 3: Write the implementation**

```ts
import type { OcrBlock } from "./anchor";

export interface ItemFieldCandidates {
  name?: OcrBlock;
  type?: OcrBlock;
  affixes: string[];
}

export function extractItemFields(blocks: OcrBlock[]): ItemFieldCandidates {
  const sorted = [...blocks].sort((a, b) => a.frame.y - b.frame.y);
  const [name, type, ...rest] = sorted;

  return {
    name,
    type,
    affixes: rest.map((b) => b.text),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter expo test itemFields`
Expected: PASS, 4 tests.

**Step 5: Commit**

```bash
git add apps/expo/src/features/scanner/itemFields.ts apps/expo/src/features/scanner/itemFields.test.ts
git commit -m "feat: add extractItemFields (topmost-block heuristic)"
```

---

### Task 3: `rarity.ts` (TDD)

**Files:**
- Create: `apps/expo/src/features/scanner/rarity.ts`
- Create: `apps/expo/src/features/scanner/rarity.test.ts`

**Step 1: Write the failing test**

```ts
import { classifyRarity } from "./rarity";

describe("classifyRarity", () => {
  it("classifies an exact rarity color match", () => {
    expect(classifyRarity({ r: 245, g: 225, b: 74 })).toBe("rare");
  });

  it("classifies a close (noisy) color match within threshold", () => {
    // legendary (#f59b42) nudged by a few units per channel
    expect(classifyRarity({ r: 240, g: 150, b: 70 })).toBe("legendary");
  });

  it("returns undefined when no color is within threshold", () => {
    expect(classifyRarity({ r: 0, g: 0, b: 0 })).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter expo test rarity`
Expected: FAIL — `Cannot find module './rarity'`.

**Step 3: Write the implementation**

```ts
import { itemConfig } from "./config";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function classifyRarity(rgb: Rgb): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;

  for (const [rarity, hex] of Object.entries(itemConfig.rarityColors)) {
    const d = distance(rgb, hexToRgb(hex));
    if (d < bestDistance) {
      bestDistance = d;
      best = rarity;
    }
  }

  return bestDistance <= itemConfig.rarityColorThreshold ? best : undefined;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter expo test rarity`
Expected: PASS, 3 tests.

Note: black (`{r:0,g:0,b:0}`) is ~172 units from the nearest configured
color (`common`, `#c8c8c8`), well past the threshold of 40 — confirms
the "no match" test case is well clear of any real rarity color, not a
coincidental near-miss.

**Step 5: Commit**

```bash
git add apps/expo/src/features/scanner/rarity.ts apps/expo/src/features/scanner/rarity.test.ts
git commit -m "feat: add classifyRarity color-distance matcher"
```

---

### Task 4: `D4OcrModule.kt` — optional ROI + `topBlockColor`

**Files:**
- Modify: `apps/expo/modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrModule.kt`

No local Kotlin test runner exists in this environment — this task is
implementation + `./gradlew assembleDebug` to confirm it compiles;
on-device behavior is verified in Task 8.

**Step 1: Make `roi` nullable and skip cropping when absent**

Change the `AsyncFunction` signature and body:

```kotlin
AsyncFunction("recognizeImage") { uri: String, roi: RoiRecord? ->
  val path = uri.removePrefix("file://")
  val decoded = BitmapFactory.decodeFile(path)
    ?: throw CodedException("Failed to decode photo at $uri")
  val bitmap = applyExifRotation(decoded, path)

  val target = if (roi != null) {
    val roiRect = roiRectFor(bitmap, roi)
    Bitmap.createBitmap(bitmap, roiRect.left, roiRect.top, roiRect.width(), roiRect.height())
  } else {
    bitmap
  }

  val inputImage = InputImage.fromBitmap(target, 0)
  val blocks = D4OcrRecognizer.recognize(inputImage)
  val topBlock = blocks.minByOrNull { it.y }
  val topBlockColor = topBlock?.let { averageColor(target, it) }

  mapOf(
    "blocks" to blocks.map { b ->
      mapOf(
        "text" to b.text,
        "confidence" to b.confidence,
        "frame" to mapOf(
          "x" to b.x,
          "y" to b.y,
          "width" to b.width,
          "height" to b.height,
        ),
      )
    },
    "width" to target.width,
    "height" to target.height,
    "topBlockColor" to topBlockColor,
  )
}
```

**Step 2: Add the `averageColor` helper**

Add alongside `roiRectFor`/`applyExifRotation`:

```kotlin
// Samples every 4th pixel in both axes for speed - a rarity color read
// only needs the dominant hue, not per-pixel precision, and item-name
// bounding boxes can be large enough that a full scan is wasteful.
private fun averageColor(bitmap: Bitmap, block: D4OcrBlock): Map<String, Int> {
  val rect = Rect(
    block.x.coerceIn(0, bitmap.width),
    block.y.coerceIn(0, bitmap.height),
    (block.x + block.width).coerceIn(0, bitmap.width),
    (block.y + block.height).coerceIn(0, bitmap.height),
  )
  var rSum = 0L
  var gSum = 0L
  var bSum = 0L
  var count = 0L
  val stride = 4
  var y = rect.top
  while (y < rect.bottom) {
    var x = rect.left
    while (x < rect.right) {
      val pixel = bitmap.getPixel(x, y)
      rSum += (pixel shr 16) and 0xFF
      gSum += (pixel shr 8) and 0xFF
      bSum += pixel and 0xFF
      count++
      x += stride
    }
    y += stride
  }
  if (count == 0L) return mapOf("r" to 0, "g" to 0, "b" to 0)
  return mapOf("r" to (rSum / count).toInt(), "g" to (gSum / count).toInt(), "b" to (bSum / count).toInt())
}
```

This references `D4OcrBlock` (defined in `D4OcrRecognizer.kt`, already
in the same package — no new import needed) instead of `Rect` for the
parameter so the caller doesn't need to build a `Rect` itself.

**Step 3: Build to confirm it compiles**

Run: `cd apps/expo/android && ./gradlew assembleDebug --console=plain 2>&1 | tail -60`
Expected: `BUILD SUCCESSFUL`.

**Step 4: Commit**

```bash
git add apps/expo/modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrModule.kt
git commit -m "feat: skip ROI crop when absent, sample top-block color natively"
```

---

### Task 5: Update the `D4Ocr` JS wrapper types

**Files:**
- Modify: `apps/expo/modules/d4-ocr/index.ts`

**Step 1: Update the interface**

```ts
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
```

**Step 2: Typecheck**

Run: `pnpm --filter expo typecheck`
Expected: no errors (this will show errors from Task 6/7 call sites
until those are done — if you're executing tasks in order, this task's
own change is type-correct in isolation; a downstream error here is
expected until Task 6 lands and is not a sign this step is wrong).

**Step 3: Commit**

```bash
git add apps/expo/modules/d4-ocr/index.ts
git commit -m "feat: type D4Ocr.recognizeImage's nullable ROI and topBlockColor"
```

---

### Task 6: Generalize `useCharacterScan.ts` into `useScan.ts`

**Files:**
- Create: `apps/expo/src/features/scanner/useScan.ts`
- Delete: `apps/expo/src/features/scanner/useCharacterScan.ts`

No unit test for this file — per the capture-based-scan design doc, the
capture flow is thin glue over `takePhoto()` and the native module call,
verified on-device (Task 8), not mocked.

**Step 1: Write `useScan.ts`**

```ts
import { useRef, useState } from "react";
import { File } from "expo-file-system";
import type { Camera } from "react-native-vision-camera";

import D4Ocr from "../../../modules/d4-ocr";
import { findAnchor } from "./anchor";
import { extractFields } from "./fields";
import { extractItemFields } from "./itemFields";
import { classifyRarity } from "./rarity";
import { scannerConfig } from "./config";

export type ScanMode = "character" | "item";
export type ScanStatus = "idle" | "capturing" | "processing" | "done" | "error";

export interface CharacterCandidates {
  level?: string;
  title?: string;
  name?: string;
}

export interface ItemCandidates {
  name?: string;
  type?: string;
  rarity?: string;
  affixes: string[];
}

export function useScan(mode: ScanMode, cameraRef: React.RefObject<Camera | null>) {
  const [candidates, setCandidates] = useState<CharacterCandidates | ItemCandidates>({});
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
        const result = await D4Ocr.recognizeImage(uri, null);
        const fields = extractItemFields(result.blocks);
        setCandidates({
          name: fields.name?.text,
          type: fields.type?.text,
          affixes: fields.affixes,
          rarity: result.topBlockColor ? classifyRarity(result.topBlockColor) : undefined,
        });
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
    setError(undefined);
    setStatus("idle");
  };

  return { candidates, status, photoPath, error, capture, retake };
}
```

**Step 2: Delete the old hook**

```bash
git rm apps/expo/src/features/scanner/useCharacterScan.ts
```

**Step 3: Typecheck (expect scan.tsx errors until Task 7)**

Run: `pnpm --filter expo typecheck`
Expected: errors only in `scan.tsx` (still importing the deleted hook) —
that's fixed in Task 7, not a sign this task is wrong.

**Step 4: Commit**

```bash
git add apps/expo/src/features/scanner/useScan.ts apps/expo/src/features/scanner/useCharacterScan.ts
git commit -m "feat: generalize useCharacterScan into mode-aware useScan"
```

---

### Task 7: `scan.tsx` — mode toggle + item results view

**Files:**
- Modify: `apps/expo/src/app/scan.tsx`

**Step 1: Add mode state, toggle, and branch the UI**

Replace the full file with:

```tsx
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { Stack } from "expo-router";

import { scannerConfig } from "~/features/scanner/config";
import { useScan, type ScanMode, type ItemCandidates } from "~/features/scanner/useScan";

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);
  const [mode, setMode] = useState<ScanMode>("character");
  const { candidates, status, photoPath, error, capture, retake } = useScan(mode, cameraRef);

  if (!hasPermission) {
    void requestPermission();
    return (
      <View className="bg-background h-full w-full items-center justify-center">
        <Stack.Screen options={{ title: "Scan" }} />
        <Text className="text-foreground">Requesting camera permission…</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View className="bg-background h-full w-full items-center justify-center">
        <Stack.Screen options={{ title: "Scan" }} />
        <Text className="text-foreground">No camera device found.</Text>
      </View>
    );
  }

  const showPhoto = status !== "idle" && photoPath;
  const itemCandidates = candidates as ItemCandidates;

  return (
    <View className="h-full w-full">
      <Stack.Screen options={{ title: "Scan" }} />
      {showPhoto ? (
        <Image source={{ uri: photoPath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive={true} photo={true} />
      )}
      {status === "idle" && mode === "character" && (
        <View
          className="absolute"
          style={{
            left: `${scannerConfig.roi.x * 100}%`,
            top: `${scannerConfig.roi.y * 100}%`,
            width: `${scannerConfig.roi.width * 100}%`,
            height: `${scannerConfig.roi.height * 100}%`,
            borderWidth: 2,
            borderColor: "#22d3ee",
          }}
        />
      )}
      {(status === "capturing" || status === "processing") && (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <Text className="text-base" style={{ color: "#ffffff" }}>Scanning…</Text>
        </View>
      )}
      {status === "idle" && (
        <View className="absolute inset-x-4 top-4 flex-row justify-center gap-2">
          {(["character", "item"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: mode === m ? "#22d3ee" : "rgba(0,0,0,0.5)" }}
            >
              <Text
                className="text-sm font-semibold capitalize"
                style={{ color: mode === m ? "#000000" : "#ffffff" }}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {status === "idle" && (
        <View className="absolute inset-x-4 bottom-16 items-center">
          <Pressable onPress={() => void capture()} className="rounded-full bg-cyan-400 px-6 py-3">
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Take Picture</Text>
          </Pressable>
        </View>
      )}
      {status === "done" && mode === "character" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Level: {candidates.level ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Title: {candidates.title ?? "—"}</Text>
          <Text className="mb-3 text-base" style={{ color: "#ffffff" }}>Name: {candidates.name ?? "—"}</Text>
          <Pressable onPress={retake} className="items-center rounded-full bg-cyan-400 px-6 py-3">
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Retake</Text>
          </Pressable>
        </View>
      )}
      {status === "done" && mode === "item" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Name: {itemCandidates.name ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Rarity: {itemCandidates.rarity ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Type: {itemCandidates.type ?? "—"}</Text>
          <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Affixes:</Text>
          {itemCandidates.affixes.length === 0 ? (
            <Text className="mb-3 text-base" style={{ color: "#ffffff" }}>—</Text>
          ) : (
            itemCandidates.affixes.map((affix, i) => (
              <Text key={i} className="mb-1 text-base" style={{ color: "#ffffff" }}>{affix}</Text>
            ))
          )}
          <Pressable onPress={retake} className="mt-2 items-center rounded-full bg-cyan-400 px-6 py-3">
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Retake</Text>
          </Pressable>
        </View>
      )}
      {status === "error" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text className="mb-3 text-base" style={{ color: "#ffffff" }}>Error: {error}</Text>
          <Pressable onPress={retake} className="items-center rounded-full bg-cyan-400 px-6 py-3">
            <Text className="text-base font-semibold" style={{ color: "#000000" }}>Retake</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
```

Note the border color/width stays inline per the [[nativewind-color-border-quirk]]
memory — don't revert this to a `border-cyan-400` className.

**Step 2: Typecheck and lint**

Run: `pnpm --filter expo typecheck && pnpm --filter expo lint`
Expected: typecheck clean. Lint: no *new* errors beyond the pre-existing
`anchor.ts` non-null-assertion errors already present on `main` before
this plan (confirmed in the capture-based-scan pivot — don't try to fix
those as part of this task, out of scope).

**Step 3: Run the JS test suite**

Run: `pnpm --filter expo test`
Expected: PASS, all suites (including Task 2/3's new tests).

**Step 4: Commit**

```bash
git add apps/expo/src/app/scan.tsx
git commit -m "feat: add character/item mode toggle and item results view to scan screen"
```

---

### Task 8: On-device build and manual verification

**Files:** none (build + manual test only)

**Step 1: Rebuild**

Run: `cd apps/expo/android && ./gradlew assembleDebug --console=plain 2>&1 | tail -60`
Expected: `BUILD SUCCESSFUL`.

**Step 2: Install**

Run: `adb install -r apps/expo/android/app/build/outputs/apk/debug/app-debug.apk`
Expected: `Success`.

**Step 3: Reload the app** (Metro should already be running from prior
work; if not, start it per the capture-based-scan pivot's process)

Force-stop and relaunch via `adb shell am force-stop your.bundle.identifier`
then `adb shell monkey -p your.bundle.identifier -c android.intent.category.LAUNCHER 1`,
same as used for the capture-based-scan pivot's verification pass.

**Step 4: Manual verification checklist**

- [ ] `/scan` opens in Character mode by default; ROI box visible.
- [ ] Tapping "Item" toggle hides the ROI box.
- [ ] Character mode capture still works (regression check against the
      capture-based-scan pivot — Level/Title/Name populate correctly
      against a real character panel).
- [ ] Item mode: point at a real item tooltip in-game, tap Take Picture.
      Confirm `status` reaches `done` (not stuck/crashed) and the results
      panel shows Name/Rarity/Type/Affixes (any of which may be `—` or
      wrong on the first pass — per the design doc, the layout heuristic
      and rarity color table are expected to need a follow-up tuning
      pass, same as the character panel needed in Phase 3). The bar for
      this task is "doesn't crash, flows through to done, shows
      *something* in each field" — not "gets every field right."
- [ ] Retake works from both `done` and `error` states in item mode.
- [ ] `adb logcat -d | grep -iE "d4ocr|FATAL|AndroidRuntime"` shows no
      exceptions during the above.

**Step 5: If anything is broken (not just miscalibrated), fix and re-verify**

A crash, an exception in logcat, or `status` never leaving `processing`
are bugs to fix now. Wrong-but-present text in a field is expected and
is the subject of a separate follow-up tuning pass — don't scope-creep
into rarity-color/layout tuning here.

**Step 6: Record the outcome**

If everything in the checklist passes: no separate commit needed (no
code changed in this task unless Step 5 required a fix, in which case
commit that fix normally).

If the on-device pass surfaces specific miscalibration (e.g. rarity
never matches, or type is consistently the wrong block for some gear
category), do not attempt to fix it as part of this task — note it for
a dedicated tuning pass, matching how the design doc scoped that out.

---

## Summary

| Task | File(s) | Verified by |
|---|---|---|
| 1 | `config.ts` | typecheck |
| 2 | `itemFields.ts` + test | `pnpm test itemFields` |
| 3 | `rarity.ts` + test | `pnpm test rarity` |
| 4 | `D4OcrModule.kt` | `gradlew assembleDebug` |
| 5 | `modules/d4-ocr/index.ts` | typecheck |
| 6 | `useScan.ts` (replaces `useCharacterScan.ts`) | typecheck (scan.tsx errors expected until Task 7) |
| 7 | `scan.tsx` | typecheck + lint + `pnpm test` |
| 8 | (none — verification) | on-device manual pass |
