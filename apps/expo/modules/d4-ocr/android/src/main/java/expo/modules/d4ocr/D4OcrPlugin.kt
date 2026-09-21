package expo.modules.d4ocr

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import com.google.mlkit.vision.common.InputImage
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.io.ByteArrayOutputStream

class D4OcrPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?) : FrameProcessorPlugin() {

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        val image = frame.imageProxy.image ?: return null
        val width = image.width
        val height = image.height

        val roiX = ((params?.get("roiX") as? Number)?.toDouble() ?: 0.0).coerceIn(0.0, 1.0)
        val roiY = ((params?.get("roiY") as? Number)?.toDouble() ?: 0.0).coerceIn(0.0, 1.0)
        val roiWidth = ((params?.get("roiWidth") as? Number)?.toDouble() ?: 1.0).coerceIn(0.01, 1.0)
        val roiHeight = ((params?.get("roiHeight") as? Number)?.toDouble() ?: 1.0).coerceIn(0.01, 1.0)

        val roiRect = Rect(
            (roiX * width).toInt(),
            (roiY * height).toInt(),
            ((roiX + roiWidth) * width).toInt().coerceAtMost(width),
            ((roiY + roiHeight) * height).toInt().coerceAtMost(height),
        )

        val nv21 = imageToNv21(image)
        val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val jpegStream = ByteArrayOutputStream()
        yuvImage.compressToJpeg(roiRect, 90, jpegStream)
        val jpegBytes = jpegStream.toByteArray()

        val bitmap = android.graphics.BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
            ?: return null
        val rotationDegrees = frame.imageProxy.imageInfo.rotationDegrees
        val inputImage = InputImage.fromBitmap(bitmap, rotationDegrees)

        val blocks = D4OcrRecognizer.recognize(inputImage)

        return mapOf(
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
            "width" to bitmap.width,
            "height" to bitmap.height,
        )
    }

    /**
     * Stride-aware YUV_420_888 -> NV21 conversion. Camera planes are not
     * guaranteed to be tightly packed (row/pixel stride can exceed
     * width/1 respectively), so this reads via each plane's actual strides
     * rather than assuming a packed buffer.
     */
    private fun imageToNv21(image: Image): ByteArray {
        val width = image.width
        val height = image.height
        val chromaWidth = width / 2
        val chromaHeight = height / 2
        val nv21 = ByteArray(width * height + chromaWidth * chromaHeight * 2)

        val yPlane = image.planes[0]
        val yBuffer = yPlane.buffer.duplicate()
        var pos = 0
        for (row in 0 until height) {
            yBuffer.position(row * yPlane.rowStride)
            yBuffer.get(nv21, pos, width)
            pos += width
        }

        val uPlane = image.planes[1]
        val vPlane = image.planes[2]
        val uBuffer = uPlane.buffer.duplicate()
        val vBuffer = vPlane.buffer.duplicate()

        for (row in 0 until chromaHeight) {
            for (col in 0 until chromaWidth) {
                val vIndex = row * vPlane.rowStride + col * vPlane.pixelStride
                val uIndex = row * uPlane.rowStride + col * uPlane.pixelStride
                nv21[pos++] = vBuffer.get(vIndex)
                nv21[pos++] = uBuffer.get(uIndex)
            }
        }

        return nv21
    }
}
