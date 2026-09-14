package expo.modules.starprocessor

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max

class StarProcessorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StarProcessor")

    AsyncFunction("stackAverageAsync") Coroutine { sourceUris: List<String>, jpegQuality: Int ->
      withContext(Dispatchers.Default) {
        stackAverage(sourceUris, jpegQuality.coerceIn(80, 100))
      }
    }
  }

  private fun stackAverage(
    sourceUris: List<String>,
    jpegQuality: Int,
  ): Map<String, Any> {
    require(sourceUris.size in 2..MAX_FRAMES) {
      "Star stacking requires between 2 and $MAX_FRAMES frames."
    }

    val paths = sourceUris.map(::filePath)
    val base = decodeOrientedBitmap(paths.first())
      ?: throw IllegalArgumentException("The first Star frame could not be decoded.")
    val mutableBase = if (base.isMutable && base.config == Bitmap.Config.ARGB_8888) {
      base
    } else {
      base.copy(Bitmap.Config.ARGB_8888, true).also { base.recycle() }
    }

    try {
      paths.drop(1).forEachIndexed { index, path ->
        val decoded = decodeOrientedBitmap(path)
          ?: throw IllegalArgumentException("Star frame ${index + 2} could not be decoded.")
        val frame = if (decoded.width == mutableBase.width && decoded.height == mutableBase.height) {
          decoded
        } else {
          Bitmap.createScaledBitmap(decoded, mutableBase.width, mutableBase.height, true)
            .also { decoded.recycle() }
        }
        try {
          averageInto(mutableBase, frame, index + 1)
        } finally {
          frame.recycle()
        }
      }

      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val output = File(context.cacheDir, "intellicam-star-${UUID.randomUUID()}.jpg")
      FileOutputStream(output).use { stream ->
        check(mutableBase.compress(Bitmap.CompressFormat.JPEG, jpegQuality, stream)) {
          "The stacked Star photo could not be encoded."
        }
      }
      return mapOf(
        "uri" to Uri.fromFile(output).toString(),
        "frameCount" to sourceUris.size,
      )
    } finally {
      mutableBase.recycle()
    }
  }

  private fun averageInto(base: Bitmap, frame: Bitmap, previousFrameCount: Int) {
    val width = base.width
    val basePixels = IntArray(width * ROW_BLOCK_SIZE)
    val framePixels = IntArray(width * ROW_BLOCK_SIZE)
    val divisor = previousFrameCount + 1

    var startY = 0
    while (startY < base.height) {
      val rowCount = minOf(ROW_BLOCK_SIZE, base.height - startY)
      val pixelCount = width * rowCount
      base.getPixels(basePixels, 0, width, 0, startY, width, rowCount)
      frame.getPixels(framePixels, 0, width, 0, startY, width, rowCount)
      for (pixelIndex in 0 until pixelCount) {
        val first = basePixels[pixelIndex]
        val next = framePixels[pixelIndex]
        val red = (((first shr 16 and 0xff) * previousFrameCount) + (next shr 16 and 0xff)) / divisor
        val green = (((first shr 8 and 0xff) * previousFrameCount) + (next shr 8 and 0xff)) / divisor
        val blue = (((first and 0xff) * previousFrameCount) + (next and 0xff)) / divisor
        basePixels[pixelIndex] = (0xff shl 24) or (red shl 16) or (green shl 8) or blue
      }
      base.setPixels(basePixels, 0, width, 0, startY, width, rowCount)
      startY += rowCount
    }
  }

  private fun decodeOrientedBitmap(path: String): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    var sampleSize = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sampleSize * 2) >= MAX_OUTPUT_EDGE) {
      sampleSize *= 2
    }
    val decoded = BitmapFactory.decodeFile(
      path,
      BitmapFactory.Options().apply {
        inPreferredConfig = Bitmap.Config.ARGB_8888
        inMutable = true
        inSampleSize = sampleSize
      },
    ) ?: return null
    val orientation = ExifInterface(path).getAttributeInt(
      ExifInterface.TAG_ORIENTATION,
      ExifInterface.ORIENTATION_NORMAL,
    )
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.setRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.setRotate(-90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
    }
    if (matrix.isIdentity) return decoded
    return Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
      .also { if (it !== decoded) decoded.recycle() }
  }

  private fun filePath(value: String): String {
    val uri = Uri.parse(value)
    val path = if (uri.scheme == "file") uri.path else value
    require(!path.isNullOrBlank() && File(path).exists()) {
      "A Star capture frame no longer exists."
    }
    return path
  }

  companion object {
    private const val MAX_FRAMES = 8
    private const val MAX_OUTPUT_EDGE = 3200
    private const val ROW_BLOCK_SIZE = 32
  }
}
