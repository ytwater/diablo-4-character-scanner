package expo.modules.d4ocr

import android.graphics.Rect
import android.media.Image
import com.google.mlkit.vision.common.InputImage
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

class D4OcrPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?) : FrameProcessorPlugin() {

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        val image = frame.imageProxy.image ?: return null
        val width = image.width
        val height = image.height

        val roiX = ((params?.get("roiX") as? Number)?.toDouble() ?: 0.0).coerceIn(0.0, 1.0)
        val roiY = ((params?.get("roiY") as? Number)?.toDouble() ?: 0.0).coerceIn(0.0, 1.0)
        val roiWidth = ((params?.get("roiWidth") as? Number)?.toDouble() ?: 1.0).coerceIn(0.01, 1.0)
        val roiHeight = ((params?.get("roiHeight") as? Number)?.toDouble() ?: 1.0).coerceIn(0.01, 1.0)

        // NV21/YUV420 chroma planes are subsampled 2x2, so every edge must
        // land on an even pixel or the chroma crop below reads the wrong
        // samples.
        val roiRect = Rect(
            ((roiX * width).toInt() and 1.inv()),
            ((roiY * height).toInt() and 1.inv()),
            (((roiX + roiWidth) * width).toInt().coerceAtMost(width) and 1.inv()),
            (((roiY + roiHeight) * height).toInt().coerceAtMost(height) and 1.inv()),
        )
        if (roiRect.width() <= 0 || roiRect.height() <= 0) return null

        val nv21 = imageToNv21(image)
        val croppedNv21 = cropNv21(nv21, width, height, roiRect)
        val rotationDegrees = frame.imageProxy.imageInfo.rotationDegrees
        val inputImage = InputImage.fromByteArray(
            croppedNv21,
            roiRect.width(),
            roiRect.height(),
            rotationDegrees,
            InputImage.IMAGE_FORMAT_NV21,
        )

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
            "width" to roiRect.width(),
            "height" to roiRect.height(),
        )
    }

    /**
     * Crops a tightly-packed full-frame NV21 buffer (as produced by
     * [imageToNv21]) down to [roiRect], avoiding the
     * YuvImage->JPEG->Bitmap round trip ML Kit's InputImage.fromByteArray
     * doesn't need. roiRect's edges are already snapped to even pixels by
     * the caller.
     */
    private fun cropNv21(nv21: ByteArray, fullWidth: Int, fullHeight: Int, roiRect: Rect): ByteArray {
        val cropWidth = roiRect.width()
        val cropHeight = roiRect.height()
        val cropChromaWidth = cropWidth / 2
        val cropChromaHeight = cropHeight / 2
        val cropped = ByteArray(cropWidth * cropHeight + cropChromaWidth * cropChromaHeight * 2)

        var pos = 0
        for (row in 0 until cropHeight) {
            val srcRowStart = (roiRect.top + row) * fullWidth + roiRect.left
            System.arraycopy(nv21, srcRowStart, cropped, pos, cropWidth)
            pos += cropWidth
        }

        val fullChromaWidth = fullWidth / 2
        val yPlaneSize = fullWidth * fullHeight
        val roiChromaLeft = roiRect.left / 2
        val roiChromaTop = roiRect.top / 2
        for (row in 0 until cropChromaHeight) {
            val srcRowStart = yPlaneSize +
                (roiChromaTop + row) * fullChromaWidth * 2 +
                roiChromaLeft * 2
            System.arraycopy(nv21, srcRowStart, cropped, pos, cropChromaWidth * 2)
            pos += cropChromaWidth * 2
        }

        return cropped
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
