package expo.modules.d4ocr

import android.graphics.BitmapFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.mlkit.vision.common.InputImage
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class OcrFixtureExportTest {

    @Test
    fun exportOcrFixtures() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val outputDir = File(instrumentation.targetContext.getExternalFilesDir(null), "ocr-fixtures")
        outputDir.mkdirs()

        (1..14).map { "character-sheet-%02d.jpg".format(it) }.forEach { fileName ->
            val bytes = instrumentation.context.assets.open("character-sheets/$fileName").use { it.readBytes() }
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            val inputImage = InputImage.fromBitmap(bitmap, 0)
            val blocks = D4OcrRecognizer.recognize(inputImage)

            val json = JSONObject().apply {
                put("width", bitmap.width)
                put("height", bitmap.height)
                put(
                    "blocks",
                    JSONArray(
                        blocks.map { b ->
                            JSONObject().apply {
                                put("text", b.text)
                                put("confidence", b.confidence)
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

            File(outputDir, fileName.replace(".jpg", ".json")).writeText(json.toString(2))
        }
    }
}
