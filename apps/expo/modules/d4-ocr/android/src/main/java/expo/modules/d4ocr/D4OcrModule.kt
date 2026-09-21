package expo.modules.d4ocr

import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class D4OcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("D4Ocr")

    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanText") { proxy, options ->
        D4OcrPlugin(proxy, options)
      }
    }
  }
}
