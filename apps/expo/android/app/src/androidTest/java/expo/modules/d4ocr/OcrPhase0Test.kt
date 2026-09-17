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
        // NOTE: this app/test build uses separate application IDs for the app
        // under test ("your.bundle.identifier") and the test APK
        // ("your.bundle.identifier.test"), so the androidTest/assets photos are
        // only visible through the instrumentation's own context, not
        // targetContext (which points at the app-under-test's APK and has no
        // assets). Using targetContext here throws FileNotFoundException.
        val context = InstrumentationRegistry.getInstrumentation().context
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
