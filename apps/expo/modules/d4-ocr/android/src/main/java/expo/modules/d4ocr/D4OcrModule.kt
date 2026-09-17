package expo.modules.d4ocr

import android.graphics.BitmapFactory
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.net.URL

// Raw Map<String, Any> return values from an AsyncFunction don't serialize
// reliably across the Expo Modules bridge -- nested maps came back as empty
// objects ({}) in practice. Record classes with @Field give the reflection-based
// converter explicit, unambiguous types to bridge.
class TextBlockFrame(
  @Field val x: Int = 0,
  @Field val y: Int = 0,
  @Field val width: Int = 0,
  @Field val height: Int = 0,
) : Record

class TextBlockResult(
  @Field val text: String = "",
  @Field val frame: TextBlockFrame = TextBlockFrame(),
) : Record

class D4OcrModule : Module() {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('D4Ocr')` in JavaScript.
    Name("D4Ocr")

    // Registers this module's frame processor plugin with VisionCamera so JS can
    // look it up via VisionCameraProxy.initFrameProcessorPlugin("scanText", {}).
    // Runs once per module load, same lifecycle as autolinking.
    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanText") { proxy, options ->
        D4OcrFrameProcessorPlugin(proxy, options)
      }
    }

    // Defines constant property on the module.
    Constant("PI") {
      Math.PI
    }

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      "Hello world! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { value: String ->
      // Send an event to JavaScript.
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    // Decodes a local file:// URI as a bitmap, runs ML Kit text recognition on it, and
    // returns per-block bounding boxes. This proves ML Kit works inside this module's own
    // build before wiring it into the VisionCamera frame processor runtime (Task 2).
    AsyncFunction("recognizeTextFromUri") { uri: String ->
      val path = uri.removePrefix("file://")
      val bitmap = BitmapFactory.decodeFile(path)
        ?: throw IllegalArgumentException("Could not decode image at $uri")
      val image = InputImage.fromBitmap(bitmap, 0)
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      val result = Tasks.await(recognizer.process(image))

      result.textBlocks.map { block ->
        val box = block.boundingBox
        TextBlockResult(
          text = block.text,
          frame = TextBlockFrame(
            x = box?.left ?: 0,
            y = box?.top ?: 0,
            width = box?.width() ?: 0,
            height = box?.height() ?: 0,
          ),
        )
      }
    }

    // Enables the module to be used as a native view. Definition components that are accepted as part of
    // the view definition: Prop, Events.
    View(D4OcrView::class) {
      // Defines a setter for the `url` prop.
      Prop("url") { view: D4OcrView, url: URL ->
        view.webView.loadUrl(url.toString())
      }
      // Defines an event that the view can send to JavaScript.
      Events("onLoad")
    }
  }
}
