package expo.modules.d4ocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.mlkit.vision.common.InputImage
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

// Native side of the native-vs-server OCR accuracy comparison. Runs the
// current D4OcrRecognizer (line-level) against every photo under
// androidTest/assets/<set>/, both full-frame and cropped to the same ROI
// D4OcrModule.recognizeImage applies, and writes one JSON per photo to
// <externalFilesDir>/ocr-comparison/<set>/. The photos are already upright
// (EXIF orientation=normal), so no rotation step is needed here.
@RunWith(AndroidJUnit4::class)
class OcrComparisonExportTest {

    // Mirrors apps/expo/src/features/scanner/config.ts - keep in sync.
    private val rois = mapOf(
        "character-sheets" to doubleArrayOf(0.1, 0.15, 0.8, 0.5),
        "item-tooltips" to doubleArrayOf(0.3, 0.15, 0.45, 0.55),
    )

    @Test
    fun exportComparisonOcr() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val assets = instrumentation.context.assets
        val root = File(instrumentation.targetContext.getExternalFilesDir(null), "ocr-comparison")

        for ((set, roi) in rois) {
            val files = assets.list(set)?.filter { it.endsWith(".jpg", ignoreCase = true) } ?: continue
            val outputDir = File(root, set).apply { mkdirs() }

            for (fileName in files.sorted()) {
                val bytes = assets.open("$set/$fileName").use { it.readBytes() }
                val full = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                val cropped = crop(full, roi)

                val json = JSONObject().apply {
                    put("full", recognize(full))
                    put("roi", recognize(cropped))
                }
                File(outputDir, fileName.replace(Regex("\\.jpe?g$", RegexOption.IGNORE_CASE), ".json"))
                    .writeText(json.toString(2))
            }
        }
    }

    // Second pass: re-OCR a region of a photo found from its first-pass
    // (full-frame) blocks - an item tooltip's frame, or a character sheet's
    // level badge. crops.json maps "<set>/<photo id>" to a pixel
    // [left, top, right, bottom] rect, generated off-device. Each crop is
    // recognized as-is ("x1") and upscaled 3x ("x3"), since ML Kit can miss
    // text that's small relative to its internal input size.
    @Test
    fun exportCropOcr() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val assets = instrumentation.context.assets
        val crops = runCatching {
            JSONObject(assets.open("crops.json").bufferedReader().use { it.readText() })
        }.getOrNull() ?: return
        val root = File(instrumentation.targetContext.getExternalFilesDir(null), "ocr-comparison/crops")

        for (key in crops.keys()) {
            val rect = crops.getJSONArray(key)
            val bytes = assets.open("$key.jpg").use { it.readBytes() }
            val full = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            val left = rect.getInt(0).coerceIn(0, full.width - 1)
            val top = rect.getInt(1).coerceIn(0, full.height - 1)
            val right = rect.getInt(2).coerceIn(left + 1, full.width)
            val bottom = rect.getInt(3).coerceIn(top + 1, full.height)
            val cropped = Bitmap.createBitmap(full, left, top, right - left, bottom - top)
            val upscaled = Bitmap.createScaledBitmap(cropped, cropped.width * 3, cropped.height * 3, true)

            val out = File(root, "$key.json").apply { parentFile?.mkdirs() }
            out.writeText(
                JSONObject().put("x1", recognize(cropped)).put("x3", recognize(upscaled)).toString(2),
            )
        }
    }

    private fun crop(bitmap: Bitmap, roi: DoubleArray): Bitmap {
        val left = (roi[0] * bitmap.width).toInt()
        val top = (roi[1] * bitmap.height).toInt()
        val right = ((roi[0] + roi[2]) * bitmap.width).toInt().coerceAtMost(bitmap.width)
        val bottom = ((roi[1] + roi[3]) * bitmap.height).toInt().coerceAtMost(bitmap.height)
        return Bitmap.createBitmap(bitmap, left, top, right - left, bottom - top)
    }

    private fun recognize(bitmap: Bitmap): JSONObject {
        val start = System.nanoTime()
        val blocks = D4OcrRecognizer.recognize(InputImage.fromBitmap(bitmap, 0))
        val elapsedMs = (System.nanoTime() - start) / 1_000_000

        return JSONObject().apply {
            put("width", bitmap.width)
            put("height", bitmap.height)
            put("elapsedMs", elapsedMs)
            put(
                "blocks",
                JSONArray(
                    blocks.map { b ->
                        JSONObject().apply {
                            put("text", b.text)
                            put("confidence", b.confidence)
                            put("angle", b.angle.toDouble())
                            put(
                                "frame",
                                JSONObject().apply {
                                    put("x", b.x)
                                    put("y", b.y)
                                    put("width", b.width)
                                    put("height", b.height)
                                },
                            )
                        }
                    },
                ),
            )
        }
    }
}
