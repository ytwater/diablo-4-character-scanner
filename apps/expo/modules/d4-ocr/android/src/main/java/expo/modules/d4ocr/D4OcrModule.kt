package expo.modules.d4ocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Rect
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class RoiRecord : Record {
  @Field
  val x: Double = 0.0

  @Field
  val y: Double = 0.0

  @Field
  val width: Double = 1.0

  @Field
  val height: Double = 1.0
}

class D4OcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("D4Ocr")

    AsyncFunction("recognizeImage") { uri: String, roi: RoiRecord ->
      val path = uri.removePrefix("file://")
      val decoded = BitmapFactory.decodeFile(path)
        ?: throw CodedException("Failed to decode photo at $uri")
      val bitmap = applyExifRotation(decoded, path)

      val roiRect = roiRectFor(bitmap, roi)
      val cropped = Bitmap.createBitmap(bitmap, roiRect.left, roiRect.top, roiRect.width(), roiRect.height())
      val inputImage = InputImage.fromBitmap(cropped, 0)

      val blocks = D4OcrRecognizer.recognize(inputImage)

      mapOf(
        "blocks" to blocks.map { b ->
          mapOf(
            "text" to b.text,
            "confidence" to b.confidence,
            "frame" to mapOf(
              "x" to b.x,
              "y" to b.y,
              "width" to b.width,
              "height" to b.height,
            ),
          )
        },
        "width" to roiRect.width(),
        "height" to roiRect.height(),
      )
    }
  }

  // takePhoto() writes the sensor's native (often landscape) orientation
  // with an EXIF rotation tag rather than pre-rotated pixels. The ROI is
  // defined relative to the upright portrait framing the user saw on
  // screen, so the bitmap must be rotated to match before cropping.
  private fun applyExifRotation(bitmap: Bitmap, path: String): Bitmap {
    val orientation = ExifInterface(path).getAttributeInt(
      ExifInterface.TAG_ORIENTATION,
      ExifInterface.ORIENTATION_NORMAL,
    )
    val degrees = when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90f
      ExifInterface.ORIENTATION_ROTATE_180 -> 180f
      ExifInterface.ORIENTATION_ROTATE_270 -> 270f
      else -> 0f
    }
    if (degrees == 0f) return bitmap

    val matrix = Matrix().apply { postRotate(degrees) }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  private fun roiRectFor(bitmap: Bitmap, roi: RoiRecord): Rect {
    val width = bitmap.width
    val height = bitmap.height

    val roiX = roi.x.coerceIn(0.0, 1.0)
    val roiY = roi.y.coerceIn(0.0, 1.0)
    val roiWidth = roi.width.coerceIn(0.01, 1.0)
    val roiHeight = roi.height.coerceIn(0.01, 1.0)

    val left = (roiX * width).toInt().coerceIn(0, width)
    val top = (roiY * height).toInt().coerceIn(0, height)
    val right = ((roiX + roiWidth) * width).toInt().coerceIn(left + 1, width)
    val bottom = ((roiY + roiHeight) * height).toInt().coerceIn(top + 1, height)

    return Rect(left, top, right, bottom)
  }
}
