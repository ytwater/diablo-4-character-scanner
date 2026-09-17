# D4 OCR Phase 0 — Capture Reality Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove that ML Kit's on-device text recognizer can read Level, Title, and
Name off a phone photo of the Diablo 4 character sheet, before any camera or
VisionCamera code exists.

> **Note:** the original plan targeted a "Class" field, assuming it appeared as
> text on the sheet. Reviewing the actual capture photos showed the sheet has no
> class string — only Name, a player-chosen Title, and Level. Updated below and
> in the design doc accordingly.

**Architecture:** Run `expo prebuild` once to get a native Android project, add the
ML Kit Text Recognition Gradle dependency directly (no React Native wrapper — this
phase never touches JS), and drive it with an Android instrumented test that loads
a folder of real phone photos from test assets and prints/asserts what came back.
No frame processor, no VisionCamera, no live camera — this is the offline
"is it even possible" check called out in the design doc.

**Tech Stack:** Expo prebuild (bare Android project), Kotlin, ML Kit Text
Recognition (`com.google.mlkit:text-recognition:16.0.1`), AndroidX Test /
Espresso instrumented tests.

Design reference: `docs/plans/2026-09-17-d4-character-scan-spike-design.md`

---

### Task 0: Capture the source photos — done

13 phone photos of the same character sheet were captured (Pixel camera, varying
angle and distance, all daylight/normal indoor lighting — no glare or dark-
background variation in this set). Ground truth, read directly off the photos:

| Field | Value |
| --- | --- |
| Name | `UDAN` |
| Title | `Demonic Defender` |
| Level | `93` |

Same values for all 13 photos, since it's one character. This is a smaller test
than originally planned (no lighting/background stress, no cross-character
variety) — noted as a gap in Phase 0 results rather than blocking on retaking
photos.

**Rename and place the files:**

```bash
cd apps/expo/android/app/src/androidTest/assets/character-sheets  # after Task 1's prebuild
i=1
for f in /home/ytwat/workspace/diablo-4-character-scanner/temp/*.jpg; do
  cp "$f" "$(printf 'character-sheet-%02d.jpg' "$i")"
  i=$((i + 1))
done
```

(13 files land as `character-sheet-01.jpg` through `character-sheet-13.jpg`. Do
this after Task 1 creates the `android/` directory.)

**Commit the photos:**

```bash
git add apps/expo/android/app/src/androidTest/assets/character-sheets/
git commit -m "test: add character sheet photos for OCR phase 0"
```

These are personal screenshots of your own gameplay, not copyrighted game assets
being redistributed — fine to commit to your own private repo.

---

### Task 1: Prebuild the native Android project

**Files:**
- Creates: `apps/expo/android/` (generated, not hand-written)
- Modify: `apps/expo/.gitignore` (check `android/` isn't already ignored — Expo's
  default ignores it since it's normally regenerated; for this spike we need to
  keep hand-edits, so we'll partially un-ignore it in Task 2)

**Step 1: Run prebuild**

```bash
cd apps/expo
npx expo prebuild --platform android
```

Expected: generates `android/` with a Gradle project, no errors. This reads
`app.config.ts` and the installed plugins list (currently `expo-router`,
`expo-secure-store`, `expo-web-browser`, `expo-splash-screen`) to configure the
native project.

**Step 2: Verify it builds clean before touching anything**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. If this fails, stop and fix the base prebuild before
adding ML Kit — don't debug two things at once.

**Step 3: Commit the generated project**

Check what Expo's `.gitignore` did:

```bash
cd apps/expo && git status --short android/ | head -5
```

If `android/` is fully ignored, add a narrow exception so this spike's native
changes are tracked (normally you'd let CI regenerate it, but this spike lives and
dies by its native code, so we want it in git):

```bash
cat .gitignore | grep -n "^/android"
```

Edit `apps/expo/.gitignore` to remove or scope down the `/android` ignore line if
present, then:

```bash
git add android/ .gitignore
git commit -m "chore: prebuild native android project for ocr spike"
```

---

### Task 2: Add the ML Kit dependency

**Files:**
- Modify: `apps/expo/android/app/build.gradle`

**Step 1: Add the dependency**

Open `apps/expo/android/app/build.gradle`, find the `dependencies { ... }` block,
add:

```gradle
dependencies {
    // ... existing entries ...
    implementation("com.google.mlkit:text-recognition:16.0.1")
}
```

**Step 2: Add instrumented test dependencies**

In the same file's `dependencies` block:

```gradle
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:core:1.6.1")
```

**Step 3: Sync and verify**

```bash
cd android && ./gradlew :app:assembleDebugAndroidTest
```

Expected: `BUILD SUCCESSFUL`. This just confirms the dependencies resolve; no test
code exists yet.

**Step 4: Commit**

```bash
git add android/app/build.gradle
git commit -m "chore: add ML Kit text recognition dependency"
```

---

### Task 3: Write the OCR reader against a single known-good photo

**Files:**
- Create: `apps/expo/android/app/src/androidTest/assets/character-sheets/` (photos
  from Task 0)
- Create: `apps/expo/android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt`

**Step 1: Write the failing test**

Pick the clearest, most straight-on photo (`character-sheet-01.jpg`) and assert
the level comes back somewhere in the recognized text — level is the numeric,
self-verifying field, so it's the best first check:

```kotlin
package expo.modules.d4ocr

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OcrPhase0Test {

    private fun recognizeAsset(fileName: String): String {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val stream = context.assets.open("character-sheets/$fileName")
        val bitmap = android.graphics.BitmapFactory.decodeStream(stream)
        val image = InputImage.fromBitmap(bitmap, 0)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val result = Tasks.await(recognizer.process(image))
        return result.text
    }

    @Test
    fun recognizesLevelOnClearPhoto() {
        val text = recognizeAsset("character-sheet-01.jpg")
        assertTrue(
            "Expected level 93 in recognized text, got:\n$text",
            text.contains("93"),
        )
    }
}
```

**Step 2: Run it and confirm it fails for the right reason first**

Before the asset even exists, or before ML Kit is wired right, expect a clear
failure (missing asset, not a silent false pass):

```bash
cd android && ./gradlew :app:connectedDebugAndroidTest --tests "expo.modules.d4ocr.OcrPhase0Test"
```

Expected: FAIL — either `FileNotFoundException` (asset missing, add the photo) or
an assertion failure showing what ML Kit actually read.

**Step 3: Make it pass**

Ensure the photo is in place at
`android/app/src/androidTest/assets/character-sheets/character-sheet-01.jpg`, and
that a physical Android device or emulator is connected (`adb devices` shows one).
Re-run the same command.

Expected: PASS, or a failure whose printed `text` shows you what ML Kit actually
read — which is itself the answer this phase exists to get. If it fails, this is
real signal: read the printed text, see how far off it is (garbled string vs.
completely empty vs. right characters wrong case), and note it — don't just tweak
the test until it's green.

**Step 4: Commit**

```bash
git add android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt
git commit -m "test: add first OCR phase 0 test against a known-good photo"
```

---

### Task 4: Extend to the full photo set with per-photo results

**Files:**
- Modify: `apps/expo/android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt`

**Step 1: Write a test over every photo**

Rather than one assertion per photo, add a test that loops all 13 assets and logs
a pass/fail table without stopping at the first failure — the goal here is a full
picture of read quality, not a single green checkmark. All 13 photos share the
same ground truth (one character), so the sample list is just the filenames plus
whether name/title were found alongside the level check:

```kotlin
    @Test
    fun reportsRecognitionAcrossAllSamples() {
        val fileNames = (1..13).map { "character-sheet-%02d.jpg".format(it) }

        val results = fileNames.map { fileName ->
            val text = recognizeAsset(fileName)
            val levelFound = text.contains("93")
            val nameFound = text.contains("UDAN", ignoreCase = true)
            val titleFound = text.contains("Demonic Defender", ignoreCase = true)
            Triple(fileName, Triple(levelFound, nameFound, titleFound), text)
        }

        val report = results.joinToString("\n") { (fileName, found, text) ->
            val (levelFound, nameFound, titleFound) = found
            "$fileName -> level=$levelFound name=$nameFound title=$titleFound\n  raw: ${text.replace("\n", " | ")}"
        }
        println(report)

        val levelHitRate = results.count { it.second.first }.toDouble() / results.size
        assertTrue(
            "Level recognized in fewer than half of samples ($levelHitRate). Report:\n$report",
            levelHitRate >= 0.5,
        )
    }
```

The 0.5 threshold is a floor, not a target — it exists so a badly broken pipeline
fails loudly instead of silently passing with a 1-in-13 hit rate. The real
judgment call is reading the printed report, including the name/title hit rates
which aren't gated by the assertion.

**Step 2: Run against the full set**

```bash
cd android && ./gradlew :app:connectedDebugAndroidTest --tests "expo.modules.d4ocr.OcrPhase0Test" -i
```

Expected: PASS or FAIL on the threshold, plus (with `-i` for info-level logging) the
full per-photo report printed to console. Save that console output somewhere —
it's the actual deliverable of Phase 0.

**Step 3: Commit**

```bash
git add android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt
git commit -m "test: report OCR recognition rate across full photo set"
```

---

### Task 5: Read the results and decide

This is a decision point, not code — do not skip it or rubber-stamp it.

Look at the printed report from Task 4 and answer, in a short note appended to the
bottom of `docs/plans/2026-09-17-d4-character-scan-spike-design.md` under a new
`## Phase 0 results` heading:

1. What fraction of photos had the level recognized correctly?
2. What fraction had the name and title recognized correctly?
3. Judging by eye from the raw text in the report: how close was a failed name/
   title read (garbled but recognizable vs. unusable)?
4. Did angle or distance visibly affect the read, even without this set's
   glare/lighting variation? Note explicitly that this set doesn't test glare,
   dark backgrounds, or a second character — flag that as follow-up capture
   work if Phase 1 goes ahead.

**Step 1: Append the results section**

```bash
cat >> docs/plans/2026-09-17-d4-character-scan-spike-design.md <<'EOF'

## Phase 0 results

<!-- Fill in from the Task 4 report: hit rates, name-field impression, and
     whether glare/angle mattered. This is the go/no-go for Phase 1. -->
EOF
```

Fill in the actual numbers and impressions, then:

```bash
git add docs/plans/2026-09-17-d4-character-scan-spike-design.md
git commit -m "docs: record phase 0 OCR results"
```

**Step 2: Decide**

If level/name recognition is reasonably reliable on decent photos (rough
guideline: better than 70% on the closer, straight-on shots), Phase 1
(VisionCamera + worklets-core install) is worth doing — but retake a proper
varied set (glare, dark background, a second character) before trusting that
number too far, since this set didn't stress those conditions. If recognition is
much worse than that even on the best photos, stop and reconsider — either the
ROI cropping approach needs rethinking, or this needs a different capture
technique (e.g. requiring the user to photograph the sheet on a plain background)
before more app code is written.

---

## Out of scope for this plan

VisionCamera, worklets-core, the frame processor, the JS scanner layer, the scan
screen, and the anchor/fields/voting logic. Those are Phase 1 onward per the design
doc, and get their own implementation plan once Phase 0's go/no-go is decided.
