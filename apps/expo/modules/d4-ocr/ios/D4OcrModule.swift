import ExpoModulesCore
import VisionCamera

public class D4OcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("D4Ocr")

    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanText") { proxy, options in
        D4OcrPlugin(proxy: proxy, options: options)
      }
    }
  }
}
