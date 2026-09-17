package expo.modules.d4ocr


import android.graphics.PixelFormat
import android.media.Image
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.mrousavy.camera.core.types.Orientation
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

// Frame processor plugins return through VisionCameraProxy's JSI bridge
// (JSIJNIConversion.cpp), not the Expo Modules reflection-based converter --
// that bridge recursively converts plain java.util.Map/List by runtime
// isInstanceOf checks, so plain Kotlin mapOf(...) is fine here. The Task 1
// Record-class bug doesn't apply to this bridge.
class D4OcrFrameProcessorPlugin(
  proxy: VisionCameraProxy,
  options: Map<String, Any>?,
) : FrameProcessorPlugin() {
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  // Frame.getOrientation() already returns the *actual* orientation of the
  // frame (it reverses the raw rotationDegrees itself -- see Frame.java's
  // getOrientation()), so this maps that orientation directly to the degrees
  // InputImage.fromMediaImage expects to rotate the buffer upright.
  private fun Orientation.toDegrees(): Int = when (this) {
    Orientation.PORTRAIT -> 0
    Orientation.LANDSCAPE_RIGHT -> 90
    Orientation.PORTRAIT_UPSIDE_DOWN -> 180
    Orientation.LANDSCAPE_LEFT -> 270
  }

  override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    // Frame.getImage() is a plain (unchecked-from-Kotlin) throw of
    // FrameInvalidError -- no try/catch required to compile, but let it
    // propagate; VisionCamera rethrows plugin errors into JS.
    val mediaImage: Image = frame.image
    val rotation = frame.orientation.toDegrees()

    // Measure the actual ML Kit cost. Earlier timing was inferred from the
    // interval between JS log lines, which was confounded by CameraX
    // back-pressure stalling the whole pipeline -- that number (~500-700ms)
    // was an upper bound on the stall, not the recognizer's real latency.
    val startNs = System.nanoTime()
    val inputImage = if (mediaImage.format == PixelFormat.RGBA_8888) {
      // ImageProxy.toBitmap() (CameraX 1.3+) handles RGBA row-stride padding
      // correctly. A hand-rolled copyPixelsFromBuffer version here read the
      // first frame fine and then returned garbage for every frame after,
      // so prefer the library's tested conversion. Verified on-device that
      // toBitmap() does NOT pre-apply rotation, so the frame's rotation still
      // has to be passed through here.
      InputImage.fromBitmap(frame.imageProxy.toBitmap(), rotation)
    } else {
      // Fallback for YUV, e.g. if the Camera's pixelFormat prop isn't "rgb".
      InputImage.fromMediaImage(mediaImage, rotation)
    }
    val result = Tasks.await(recognizer.process(inputImage))
    val elapsedMs = (System.nanoTime() - startNs) / 1_000_000
    Log.i(
      "D4Ocr",
      "mlkit ${elapsedMs}ms fmt=${mediaImage.format} ${mediaImage.width}x${mediaImage.height} blocks=${result.textBlocks.size}",
    )
    // TEMPORARY (item accuracy measurement): dump the full recognized text so
    // it can be diffed against known ground truth from the item photos.
    if (result.textBlocks.isNotEmpty()) {
      Log.i("D4OcrText", "=== FRAME ===\n" + result.text)
    }

    return result.textBlocks.map { block ->
      val box = block.boundingBox
      mapOf(
        "text" to block.text,
        "frame" to mapOf(
          "x" to (box?.left ?: 0),
          "y" to (box?.top ?: 0),
          "width" to (box?.width() ?: 0),
          "height" to (box?.height() ?: 0),
        ),
      )
    }
  }
}
