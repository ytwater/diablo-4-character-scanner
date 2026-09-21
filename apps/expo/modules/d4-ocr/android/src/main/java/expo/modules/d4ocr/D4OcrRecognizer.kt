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
)

object D4OcrRecognizer {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    fun recognize(image: InputImage): List<D4OcrBlock> {
        val result = Tasks.await(recognizer.process(image))
        return result.textBlocks.map { block ->
            val box = block.boundingBox ?: Rect()
            D4OcrBlock(
                text = block.text,
                x = box.left,
                y = box.top,
                width = box.width(),
                height = box.height(),
                confidence = 1.0,
            )
        }
    }
}
