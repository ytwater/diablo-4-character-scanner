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
        val context = InstrumentationRegistry.getInstrumentation().context
        val bytes = context.assets.open("character-sheets/$fileName").use { it.readBytes() }
        val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
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

    @Test
    fun reportsRecognitionAcrossAllSamples() {
        val fileNames = (1..14).map { "character-sheet-%02d.jpg".format(it) }

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
}
