package expo.modules.d4ocr

import android.graphics.Rect
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

data class D4OcrBlock(
    val text: String,
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    // ML Kit's per-block confidence is deprecated and always 1.0 in this API
    // version (text-recognition:16.0.1) - kept for shape parity with the
    // design doc, not a real reliability signal.
    val confidence: Double,
    // Line rotation in degrees (ML Kit's Line.angle). ML Kit can read a
    // small, rotationally symmetric shape like the level badge's diamond
    // upside down ("93" -> "£6"); such lines come back near +/-180.
    val angle: Float = 0f,
)

object D4OcrRecognizer {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    fun recognize(image: InputImage): List<D4OcrBlock> {
        val result = Tasks.await(recognizer.process(image))
        // Flatten to ML Kit's Line level, not Block level: a "block" is a
        // paragraph-like grouping that can fuse multiple visually distinct
        // tooltip lines (item name + type + subtype) into one entry when
        // they're tightly spaced, which breaks every caller's one-line-per-
        // block assumption (all-caps name/type detection, per-line color
        // sampling, classifyLines' row classification) and washes out the
        // sampled color by averaging across lines that may differ subtly in
        // tint. Lines give accurate, independent bounding boxes instead.
        return result.textBlocks.flatMap { block -> block.lines }.map { line ->
            val box = line.boundingBox ?: Rect()
            D4OcrBlock(
                text = line.text,
                x = box.left,
                y = box.top,
                width = box.width(),
                height = box.height(),
                confidence = 1.0,
                angle = line.angle,
            )
        }
    }
}
