package expo.modules.d4ocr

import android.graphics.BitmapFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Capture harness, not an assertion: runs ML Kit over the item tooltip photos
 * and dumps the raw text as JSON so it can be pinned as a unit-test fixture.
 * The existing item fixtures all contain a clean "EQUIPPED", so they can't
 * exercise the OCR-noise tolerance that detectMode/parseItem now rely on.
 */
@RunWith(AndroidJUnit4::class)
class ItemFixtureCaptureTest {

    @Test
    fun captureItemPhotos() {
        val context = InstrumentationRegistry.getInstrumentation().context
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val out = JSONArray()

        for (name in context.assets.list("items")!!.sorted()) {
            val bitmap = context.assets.open("items/$name").use { BitmapFactory.decodeStream(it) }
            val text = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0))).text
            bitmap.recycle()
            out.put(JSONObject().put("label", name.removeSuffix(".jpg")).put("text", text))
            println("D4CAP file=$name")
        }

        // Write to a file rather than logcat: long lines get split and the
        // continuation loses its tag, which silently corrupts the JSON.
        val target = InstrumentationRegistry.getInstrumentation().targetContext
        val file = java.io.File(target.getExternalFilesDir(null), "item-capture.json")
        file.writeText(out.toString(2))
        println("D4CAP wrote ${file.absolutePath} (${file.length()} bytes)")
    }
}
