package expo.modules.portraiteffect

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.SegmentationMask
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class PortraitEffectModule : Module() {
  // ML Kit's subject model handles objects and animals, not only people.
  private val subjectClient = lazy {
    SubjectSegmentation.getClient(
      SubjectSegmenterOptions.Builder()
        .enableForegroundConfidenceMask()
        .enableMultipleSubjects(
          SubjectSegmenterOptions.SubjectResultOptions.Builder().enableConfidenceMask().build()
        ).build()
    )
  }
  private val subjectSegmenter get() = subjectClient.value
  private val subjectMutex = Mutex()

  override fun definition() = ModuleDefinition {
    Name("PortraitEffect")
    Constants("subjectSegmentationVersion" to 2)
    OnDestroy {
      if (subjectClient.isInitialized()) subjectClient.value.close()
    }

    AsyncFunction("prepareAsync") Coroutine { ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val installer = ModuleInstall.getClient(context)
      if (!awaitTask(installer.areModulesAvailable(subjectSegmenter)).areModulesAvailable()) {
        awaitTask(installer.installModules(
          ModuleInstallRequest.newBuilder().addApi(subjectSegmenter).build()
        ))
        // installModules completes when the download is requested, not when it is ready.
        withTimeout(60_000) {
          while (!awaitTask(installer.areModulesAvailable(subjectSegmenter)).areModulesAvailable()) {
            delay(500)
          }
        }
      }
      true
    }

    AsyncFunction("previewMaskAsync") Coroutine { sourceUri: String, focusX: Double, focusY: Double ->
      withContext(Dispatchers.Default) {
        val bitmap = decodeOrientedBitmap(filePath(sourceUri))
          ?: throw IllegalArgumentException("The preview could not be decoded.")
        try {
          val mask = detectSubject(bitmap, focusX, focusY)
          if (mask == null) {
            mapOf("uri" to "", "applied" to false)
          } else {
            val pixels = IntArray(mask.confidence.size) { index ->
              // MaskedView uses alpha: blur background, leave detected subject transparent.
              val alpha = ((1f - smoothSubjectAlpha(mask.confidence[index])) * 255).roundToInt()
              (alpha shl 24) or 0x00ffffff
            }
            val output = Bitmap.createBitmap(pixels, mask.width, mask.height, Bitmap.Config.ARGB_8888)
            val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
            val file = File(context.cacheDir, "intellicam-portrait-mask-${UUID.randomUUID()}.png")
            try {
              FileOutputStream(file).use { check(output.compress(Bitmap.CompressFormat.PNG, 100, it)) }
            } finally {
              output.recycle()
            }
            mapOf("uri" to Uri.fromFile(file).toString(), "applied" to true)
          }
        } finally {
          bitmap.recycle()
        }
      }
    }

    AsyncFunction("applyAsync") Coroutine { sourceUri: String, jpegQuality: Int, focusX: Double, focusY: Double ->
      withContext(Dispatchers.Default) {
        applyPortraitEffect(sourceUri, jpegQuality.coerceIn(80, 100), focusX, focusY)
      }
    }

    AsyncFunction("applyBeautyAsync") Coroutine { sourceUri: String, jpegQuality: Int ->
      withContext(Dispatchers.Default) {
        applyBeautyEffect(sourceUri, jpegQuality.coerceIn(80, 100))
      }
    }
  }

  private suspend fun applyPortraitEffect(
    sourceUri: String,
    jpegQuality: Int,
    focusX: Double,
    focusY: Double,
  ): Map<String, Any> {
    val sourcePath = filePath(sourceUri)
    val sourceBitmap = decodeOrientedBitmap(sourcePath)
      ?: throw IllegalArgumentException("The captured photo could not be decoded.")
    val bitmap = scaleDown(sourceBitmap, MAX_OUTPUT_EDGE)
    if (bitmap !== sourceBitmap) sourceBitmap.recycle()

    try {
      val mask = detectSubject(bitmap, focusX, focusY)
        ?: return mapOf("uri" to sourceUri, "applied" to false)
      val blurredBackground = createBlurredBackground(bitmap)
      val output = try {
        blendSubjectPortrait(bitmap, blurredBackground, mask)
      } finally {
        blurredBackground.recycle()
      }

      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val outputFile = File(context.cacheDir, "intellicam-portrait-${UUID.randomUUID()}.jpg")
      try {
        FileOutputStream(outputFile).use { stream ->
          check(output.compress(Bitmap.CompressFormat.JPEG, jpegQuality, stream)) {
            "The portrait photo could not be encoded."
          }
        }
      } finally {
        output.recycle()
      }
      return mapOf("uri" to Uri.fromFile(outputFile).toString(), "applied" to true)
    } finally {
      if (!bitmap.isRecycled) {
        bitmap.recycle()
      }
    }
  }

  private data class SubjectMask(val confidence: FloatArray, val width: Int, val height: Int)

  private suspend fun detectSubject(bitmap: Bitmap, focusX: Double, focusY: Double): SubjectMask? {
    val detectionEdge = max(SEGMENTATION_EDGE,
      (512.0 * max(bitmap.width, bitmap.height) / min(bitmap.width, bitmap.height)).roundToInt()
    ).coerceAtMost(1536)
    val input = scaleDown(bitmap, detectionEdge)
    try {
      return subjectMutex.withLock {
        val result = awaitTask(subjectSegmenter.process(InputImage.fromBitmap(input, 0)))
        val foreground = result.foregroundConfidenceMask ?: return@withLock null
        foreground.rewind()
        var confidence = FloatArray(input.width * input.height) { foreground.get() }
        val tapX = (focusX.coerceIn(0.0, 1.0) * (input.width - 1)).roundToInt()
        val tapY = (focusY.coerceIn(0.0, 1.0) * (input.height - 1)).roundToInt()
        // Select the actual subject under the tap; background taps keep all foreground subjects.
        for (subject in result.subjects) {
          val x = tapX - subject.startX
          val y = tapY - subject.startY
          val buffer = subject.confidenceMask ?: continue
          if (x !in 0 until subject.width || y !in 0 until subject.height) continue
          if (buffer.get(y * subject.width + x) < SUBJECT_DETECTION_THRESHOLD) continue
          confidence = FloatArray(input.width * input.height)
          buffer.rewind()
          for (row in 0 until subject.height) {
            for (column in 0 until subject.width) {
              val value = buffer.get()
              val destX = subject.startX + column
              val destY = subject.startY + row
              if (destX in 0 until input.width && destY in 0 until input.height) {
                confidence[destY * input.width + destX] = value
              }
            }
          }
          break
        }
        val count = confidence.count { it >= SUBJECT_DETECTION_THRESHOLD }
        if (count < max(1, (confidence.size * MIN_SUBJECT_FRACTION).roundToInt())) null
        else SubjectMask(confidence, input.width, input.height)
      }
    } finally {
      if (input !== bitmap) input.recycle()
    }
  }

  private suspend fun <T> awaitTask(task: com.google.android.gms.tasks.Task<T>): T =
    suspendCancellableCoroutine { continuation ->
      task.addOnSuccessListener { if (continuation.isActive) continuation.resume(it) }
        .addOnFailureListener { if (continuation.isActive) continuation.resumeWithException(it) }
        .addOnCanceledListener { continuation.cancel() }
    }

  private suspend fun applyBeautyEffect(
    sourceUri: String,
    jpegQuality: Int,
  ): Map<String, Any> {
    val sourcePath = filePath(sourceUri)
    val sourceBitmap = decodeOrientedBitmap(sourcePath)
      ?: throw IllegalArgumentException("The captured photo could not be decoded.")
    val bitmap = scaleDown(sourceBitmap, MAX_OUTPUT_EDGE)
    if (bitmap !== sourceBitmap) sourceBitmap.recycle()

    val segmentationBitmap = scaleDown(bitmap, SEGMENTATION_EDGE)
    val segmenter = Segmentation.getClient(
      SelfieSegmenterOptions.Builder()
        .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
        .build()
    )

    try {
      val mask = awaitMask(segmenter.process(InputImage.fromBitmap(segmentationBitmap, 0)))
      if (segmentationBitmap !== bitmap) segmentationBitmap.recycle()
      val confidence = readConfidenceMask(mask)
      val hasPerson = confidence.count { it >= SUBJECT_DETECTION_THRESHOLD } >=
        max(1, (confidence.size * MIN_SUBJECT_FRACTION).roundToInt())
      if (!hasPerson) {
        bitmap.recycle()
        return mapOf("uri" to sourceUri, "applied" to false)
      }

      val smoothingLayer = createBeautySmoothingLayer(bitmap)
      val output = try {
        blendBeauty(bitmap, smoothingLayer, confidence, mask.width, mask.height)
      } finally {
        bitmap.recycle()
        smoothingLayer.recycle()
      }

      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val outputFile = File(context.cacheDir, "intellicam-beauty-${UUID.randomUUID()}.jpg")
      try {
        FileOutputStream(outputFile).use { stream ->
          check(output.compress(Bitmap.CompressFormat.JPEG, jpegQuality, stream)) {
            "The Beauty photo could not be encoded."
          }
        }
      } finally {
        output.recycle()
      }
      return mapOf("uri" to Uri.fromFile(outputFile).toString(), "applied" to true)
    } finally {
      if (!segmentationBitmap.isRecycled && segmentationBitmap !== bitmap) {
        segmentationBitmap.recycle()
      }
      if (!bitmap.isRecycled) {
        bitmap.recycle()
      }
      segmenter.close()
    }
  }

  private suspend fun awaitMask(task: com.google.android.gms.tasks.Task<SegmentationMask>) =
    suspendCancellableCoroutine { continuation ->
      task
        .addOnSuccessListener { result ->
          if (continuation.isActive) continuation.resume(result)
        }
        .addOnFailureListener { error ->
          if (continuation.isActive) continuation.resumeWithException(error)
        }
    }

  private fun filePath(uriString: String): String {
    val uri = Uri.parse(uriString)
    val path = if (uri.scheme == "file") uri.path else uriString
    require(!path.isNullOrBlank() && File(path).exists()) { "The photo file does not exist." }
    return path
  }

  private fun decodeOrientedBitmap(path: String): Bitmap? {
    val decoded = BitmapFactory.decodeFile(path) ?: return null
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
    val oriented = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    if (oriented !== decoded) decoded.recycle()
    return oriented
  }

  private fun scaleDown(bitmap: Bitmap, maximumEdge: Int): Bitmap {
    val longestEdge = max(bitmap.width, bitmap.height)
    if (longestEdge <= maximumEdge) return bitmap
    val scale = maximumEdge.toDouble() / longestEdge
    return Bitmap.createScaledBitmap(
      bitmap,
      max(1, (bitmap.width * scale).roundToInt()),
      max(1, (bitmap.height * scale).roundToInt()),
      true,
    )
  }

  private fun readConfidenceMask(mask: SegmentationMask): FloatArray {
    val buffer = mask.buffer
    buffer.rewind()
    return FloatArray(mask.width * mask.height) { buffer.float }
  }

  private fun createBlurredBackground(source: Bitmap): Bitmap {
    val longestEdge = max(source.width, source.height)
    val scale = min(1.0, BLUR_EDGE.toDouble() / longestEdge)
    val width = max(1, (source.width * scale).roundToInt())
    val height = max(1, (source.height * scale).roundToInt())
    val small = if (width == source.width && height == source.height) {
      source.copy(Bitmap.Config.ARGB_8888, true)
        ?: throw IllegalStateException("The portrait background could not be created.")
    } else {
      Bitmap.createScaledBitmap(source, width, height, true)
    }
    val pixels = IntArray(width * height)
    small.getPixels(pixels, 0, width, 0, 0, width, height)
    repeat(3) { boxBlur(pixels, width, height, BLUR_RADIUS) }
    small.setPixels(pixels, 0, width, 0, 0, width, height)
    return small
  }

  private fun createBeautySmoothingLayer(source: Bitmap): Bitmap {
    val longestEdge = max(source.width, source.height)
    val scale = min(1.0, BEAUTY_SMOOTH_EDGE.toDouble() / longestEdge)
    val width = max(1, (source.width * scale).roundToInt())
    val height = max(1, (source.height * scale).roundToInt())
    val layer = if (width == source.width && height == source.height) {
      source.copy(Bitmap.Config.ARGB_8888, true)
        ?: throw IllegalStateException("The Beauty smoothing layer could not be created.")
    } else {
      Bitmap.createScaledBitmap(source, width, height, true)
    }
    val pixels = IntArray(width * height)
    layer.getPixels(pixels, 0, width, 0, 0, width, height)
    repeat(2) { boxBlur(pixels, width, height, BEAUTY_BLUR_RADIUS) }
    layer.setPixels(pixels, 0, width, 0, 0, width, height)
    return layer
  }

  private fun boxBlur(pixels: IntArray, width: Int, height: Int, radius: Int) {
    val scratch = IntArray(pixels.size)
    val window = radius * 2 + 1

    for (y in 0 until height) {
      var red = 0
      var green = 0
      var blue = 0
      for (offset in -radius..radius) {
        val color = pixels[y * width + offset.coerceIn(0, width - 1)]
        red += color shr 16 and 0xff
        green += color shr 8 and 0xff
        blue += color and 0xff
      }
      for (x in 0 until width) {
        scratch[y * width + x] = (0xff shl 24) or
          ((red / window) shl 16) or ((green / window) shl 8) or (blue / window)
        val leaving = pixels[y * width + (x - radius).coerceIn(0, width - 1)]
        val entering = pixels[y * width + (x + radius + 1).coerceIn(0, width - 1)]
        red += (entering shr 16 and 0xff) - (leaving shr 16 and 0xff)
        green += (entering shr 8 and 0xff) - (leaving shr 8 and 0xff)
        blue += (entering and 0xff) - (leaving and 0xff)
      }
    }

    for (x in 0 until width) {
      var red = 0
      var green = 0
      var blue = 0
      for (offset in -radius..radius) {
        val color = scratch[offset.coerceIn(0, height - 1) * width + x]
        red += color shr 16 and 0xff
        green += color shr 8 and 0xff
        blue += color and 0xff
      }
      for (y in 0 until height) {
        pixels[y * width + x] = (0xff shl 24) or
          ((red / window) shl 16) or ((green / window) shl 8) or (blue / window)
        val leaving = scratch[(y - radius).coerceIn(0, height - 1) * width + x]
        val entering = scratch[(y + radius + 1).coerceIn(0, height - 1) * width + x]
        red += (entering shr 16 and 0xff) - (leaving shr 16 and 0xff)
        green += (entering shr 8 and 0xff) - (leaving shr 8 and 0xff)
        blue += (entering and 0xff) - (leaving and 0xff)
      }
    }
  }

  private fun blendSubjectPortrait(
    subject: Bitmap,
    background: Bitmap,
    mask: SubjectMask,
  ): Bitmap {
    val output = Bitmap.createBitmap(subject.width, subject.height, Bitmap.Config.ARGB_8888)
    val subjectRow = IntArray(subject.width)
    val outputRow = IntArray(subject.width)
    val backgroundPixels = IntArray(background.width * background.height)
    background.getPixels(backgroundPixels, 0, background.width, 0, 0, background.width, background.height)

    for (y in 0 until subject.height) {
      subject.getPixels(subjectRow, 0, subject.width, 0, y, subject.width, 1)
      val backgroundY = min(background.height - 1, y * background.height / subject.height)
      for (x in 0 until subject.width) {
        val backgroundX = min(background.width - 1, x * background.width / subject.width)
        // Bilinear interpolation avoids blocky edges when the mask is enlarged to photo resolution.
        val mx = (x.toFloat() * (mask.width - 1) / max(1, subject.width - 1))
        val my = (y.toFloat() * (mask.height - 1) / max(1, subject.height - 1))
        val x0 = mx.toInt()
        val y0 = my.toInt()
        val x1 = min(x0 + 1, mask.width - 1)
        val y1 = min(y0 + 1, mask.height - 1)
        val dx = mx - x0
        val dy = my - y0
        val top = mask.confidence[y0 * mask.width + x0] * (1 - dx) + mask.confidence[y0 * mask.width + x1] * dx
        val bottom = mask.confidence[y1 * mask.width + x0] * (1 - dx) + mask.confidence[y1 * mask.width + x1] * dx
        val alpha = smoothSubjectAlpha(top * (1 - dy) + bottom * dy)
        outputRow[x] = blendColor(
          subjectRow[x],
          backgroundPixels[backgroundY * background.width + backgroundX],
          alpha,
        )
      }
      output.setPixels(outputRow, 0, subject.width, 0, y, subject.width, 1)
    }
    return output
  }

  private fun blendBeauty(
    subject: Bitmap,
    smoothingLayer: Bitmap,
    confidence: FloatArray,
    maskWidth: Int,
    maskHeight: Int,
  ): Bitmap {
    val output = Bitmap.createBitmap(subject.width, subject.height, Bitmap.Config.ARGB_8888)
    val subjectRow = IntArray(subject.width)
    val outputRow = IntArray(subject.width)
    val smoothingPixels = IntArray(smoothingLayer.width * smoothingLayer.height)
    smoothingLayer.getPixels(
      smoothingPixels,
      0,
      smoothingLayer.width,
      0,
      0,
      smoothingLayer.width,
      smoothingLayer.height,
    )

    for (y in 0 until subject.height) {
      subject.getPixels(subjectRow, 0, subject.width, 0, y, subject.width, 1)
      val smoothingY = min(smoothingLayer.height - 1, y * smoothingLayer.height / subject.height)
      val maskY = min(maskHeight - 1, y * maskHeight / subject.height)
      for (x in 0 until subject.width) {
        val sourceColor = subjectRow[x]
        val smoothingX = min(smoothingLayer.width - 1, x * smoothingLayer.width / subject.width)
        val maskX = min(maskWidth - 1, x * maskWidth / subject.width)
        val subjectAlpha = smoothSubjectAlpha(confidence[maskY * maskWidth + maskX])
        val skinAlpha = skinLikelihood(sourceColor)
        val blendAmount = subjectAlpha * skinAlpha * BEAUTY_SMOOTH_STRENGTH
        val softenedColor = gentlyLiftSkinTone(
          smoothingPixels[smoothingY * smoothingLayer.width + smoothingX]
        )
        outputRow[x] = blendColor(sourceColor, softenedColor, blendAmount)
      }
      output.setPixels(outputRow, 0, subject.width, 0, y, subject.width, 1)
    }
    return output
  }

  private fun skinLikelihood(color: Int): Float {
    val red = color shr 16 and 0xff
    val green = color shr 8 and 0xff
    val blue = color and 0xff
    val brightest = max(red, max(green, blue))
    val darkest = min(red, min(green, blue))
    if (brightest < 35 || brightest - darkest < 8) return 0f

    val cb = -0.168736f * red - 0.331264f * green + 0.5f * blue + 128f
    val cr = 0.5f * red - 0.418688f * green - 0.081312f * blue + 128f
    val cbScore = (1f - kotlin.math.abs(cb - 112f) / 48f).coerceIn(0f, 1f)
    val crScore = (1f - kotlin.math.abs(cr - 153f) / 50f).coerceIn(0f, 1f)
    val warmth = if (red >= blue * 0.78f && red >= green * 0.72f) 1f else 0.35f
    return min(cbScore, crScore) * warmth
  }

  private fun gentlyLiftSkinTone(color: Int): Int {
    val red = ((color shr 16 and 0xff) * 1.025f + 2f).roundToInt().coerceIn(0, 255)
    val green = ((color shr 8 and 0xff) * 1.018f + 1f).roundToInt().coerceIn(0, 255)
    val blue = ((color and 0xff) * 1.01f).roundToInt().coerceIn(0, 255)
    return (0xff shl 24) or (red shl 16) or (green shl 8) or blue
  }

  private fun smoothSubjectAlpha(confidence: Float): Float {
    val value = ((confidence - MASK_EDGE_LOW) / (MASK_EDGE_HIGH - MASK_EDGE_LOW)).coerceIn(0f, 1f)
    return value * value * (3f - 2f * value)
  }

  private fun blendColor(foreground: Int, background: Int, alpha: Float): Int {
    val inverse = 1f - alpha
    val red = ((foreground shr 16 and 0xff) * alpha + (background shr 16 and 0xff) * inverse).roundToInt()
    val green = ((foreground shr 8 and 0xff) * alpha + (background shr 8 and 0xff) * inverse).roundToInt()
    val blue = ((foreground and 0xff) * alpha + (background and 0xff) * inverse).roundToInt()
    return (0xff shl 24) or (red shl 16) or (green shl 8) or blue
  }

  companion object {
    private const val MAX_OUTPUT_EDGE = 4096
    private const val SEGMENTATION_EDGE = 768
    private const val BLUR_EDGE = 640
    private const val BLUR_RADIUS = 10
    private const val BEAUTY_SMOOTH_EDGE = 960
    private const val BEAUTY_BLUR_RADIUS = 3
    private const val BEAUTY_SMOOTH_STRENGTH = 0.32f
    private const val SUBJECT_DETECTION_THRESHOLD = 0.55f
    private const val MIN_SUBJECT_FRACTION = 0.005f
    private const val MASK_EDGE_LOW = 0.22f
    private const val MASK_EDGE_HIGH = 0.78f
  }
}
