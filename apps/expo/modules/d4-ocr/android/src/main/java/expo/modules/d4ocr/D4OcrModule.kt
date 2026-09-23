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

    AsyncFunction("recognizeImage") { uri: String, roi: RoiRecord? ->
      val path = uri.removePrefix("file://")
      val decoded = BitmapFactory.decodeFile(path)
        ?: throw CodedException("Failed to decode photo at $uri")
      val bitmap = applyExifRotation(decoded, path)

      val target = if (roi != null) {
        val roiRect = roiRectFor(bitmap, roi)
        Bitmap.createBitmap(bitmap, roiRect.left, roiRect.top, roiRect.width(), roiRect.height())
      } else {
        bitmap
      }

      val inputImage = InputImage.fromBitmap(target, 0)
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
            // Sampled per-block rather than just for the topmost block, since
            // the topmost OCR block in the ROI is often UI chrome (a panel
            // tab or header) rather than the item's own name/rarity text -
            // callers pick whichever block they've identified as relevant.
            "color" to averageColor(target, b),
          )
        },
        "width" to target.width,
        "height" to target.height,
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

  // Samples every 4th pixel in both axes for speed - a rarity color read
  // only needs the dominant hue, not per-pixel precision, and item-name
  // bounding boxes can be large enough that a full scan is wasteful.
  private fun averageColor(bitmap: Bitmap, block: D4OcrBlock): Map<String, Int> {
    val rect = Rect(
      block.x.coerceIn(0, bitmap.width),
      block.y.coerceIn(0, bitmap.height),
      (block.x + block.width).coerceIn(0, bitmap.width),
      (block.y + block.height).coerceIn(0, bitmap.height),
    )
    val stride = 4

    // Diablo tooltip text is bright/saturated against a dark background, and
    // the glyphs themselves have a darker outline/shadow, so an unweighted
    // average over the whole bounding box (or even a fixed brightness cutoff)
    // washes the sampled color out toward the background or the outline. A
    // first pass finds the brightest pixel in the block, then only pixels
    // close to that peak - the glyph fill itself - are averaged.
    var maxBrightness = 0
    var y = rect.top
    while (y < rect.bottom) {
      var x = rect.left
      while (x < rect.right) {
        val pixel = bitmap.getPixel(x, y)
        val brightness = maxOf((pixel shr 16) and 0xFF, (pixel shr 8) and 0xFF, pixel and 0xFF)
        if (brightness > maxBrightness) maxBrightness = brightness
        x += stride
      }
      y += stride
    }
    val brightnessFloor = (maxBrightness * 0.75).toInt()

    var rSum = 0L
    var gSum = 0L
    var bSum = 0L
    var count = 0L
    y = rect.top
    while (y < rect.bottom) {
      var x = rect.left
      while (x < rect.right) {
        val pixel = bitmap.getPixel(x, y)
        val r = (pixel shr 16) and 0xFF
        val g = (pixel shr 8) and 0xFF
        val b = pixel and 0xFF
        if (maxOf(r, g, b) >= brightnessFloor) {
          rSum += r
          gSum += g
          bSum += b
          count++
        }
        x += stride
      }
      y += stride
    }
    if (count == 0L) return mapOf("r" to 0, "g" to 0, "b" to 0)
    return mapOf("r" to (rSum / count).toInt(), "g" to (gSum / count).toInt(), "b" to (bSum / count).toInt())
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
