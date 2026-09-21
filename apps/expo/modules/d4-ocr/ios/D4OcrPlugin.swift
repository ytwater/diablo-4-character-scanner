import VisionCamera
import Vision
import UIKit

class D4OcrPlugin: FrameProcessorPlugin {
  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    super.init(proxy: proxy, options: options)
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    guard let pixelBuffer = frame.buffer else { return nil }

    let roiX = (arguments?["roiX"] as? Double) ?? 0.0
    let roiY = (arguments?["roiY"] as? Double) ?? 0.0
    let roiWidth = (arguments?["roiWidth"] as? Double) ?? 1.0
    let roiHeight = (arguments?["roiHeight"] as? Double) ?? 1.0

    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    let fullExtent = ciImage.extent
    let roiRect = CGRect(
      x: fullExtent.origin.x + roiX * fullExtent.width,
      y: fullExtent.origin.y + roiY * fullExtent.height,
      width: roiWidth * fullExtent.width,
      height: roiHeight * fullExtent.height
    )
    let croppedImage = ciImage.cropped(to: roiRect)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    let handler = VNImageRequestHandler(ciImage: croppedImage, options: [:])

    do {
      try handler.perform([request])
    } catch {
      return nil
    }

    let blocks = (request.results ?? []).compactMap { observation -> [String: Any]? in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let box = observation.boundingBox
      // Vision's boundingBox is normalized (0-1) with origin bottom-left;
      // convert to pixel coordinates with origin top-left to match Android's shape.
      let x = box.origin.x * roiRect.width
      let y = (1 - box.origin.y - box.height) * roiRect.height
      return [
        "text": candidate.string,
        "confidence": Double(candidate.confidence),
        "frame": [
          "x": Int(x),
          "y": Int(y),
          "width": Int(box.width * roiRect.width),
          "height": Int(box.height * roiRect.height),
        ],
      ]
    }

    return [
      "blocks": blocks,
      "width": Int(roiRect.width),
      "height": Int(roiRect.height),
    ]
  }
}
