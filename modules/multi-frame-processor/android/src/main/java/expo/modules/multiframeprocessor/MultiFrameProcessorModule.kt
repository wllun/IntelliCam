package expo.modules.multiframeprocessor

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

class MultiFrameProcessorModule : Module() {
  private val previewAnalyzer = PreviewSceneAnalyzer()
  override fun definition() = ModuleDefinition {
    Name("MultiFrameProcessor")

    AsyncFunction("analyzePreviewAsync") Coroutine { sourceUri: String, sceneKey: String, sampledAt: Double ->
      withContext(Dispatchers.Default) {
        val bitmap = decodeOrientedBitmap(filePath(sourceUri), 96)
          ?: throw IllegalArgumentException("Invalid preview sample.")
        val small = Bitmap.createScaledBitmap(bitmap, 96, 72, true)
        if (small !== bitmap) bitmap.recycle()
        try {
          val colors = IntArray(96 * 72)
          small.getPixels(colors, 0, 96, 0, 0, 96, 72)
          previewAnalyzer.analyze(colors, 96, 72, sceneKey, sampledAt)
        } finally { small.recycle() }
      }
    }

    AsyncFunction("sampleMotionAsync") Coroutine { ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      val sensor = manager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
      if (sensor == null) mapOf("gyroRms" to null, "gyroSamples" to 0) else {
        val lock = Any()
        var squared = 0.0
        var samples = 0
        val listener = object : SensorEventListener {
          override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
          override fun onSensorChanged(event: SensorEvent) {
            synchronized(lock) {
              squared += event.values.take(3).sumOf { it.toDouble() * it }
              samples++
            }
          }
        }
        try {
          manager.registerListener(listener, sensor, 50000, Handler(Looper.getMainLooper()))
          delay(300)
          synchronized(lock) {
            mapOf("gyroRms" to if (samples >= 3) sqrt(squared / samples) else null, "gyroSamples" to samples)
          }
        } finally { manager.unregisterListener(listener) }
      }
    }

    AsyncFunction("measureAsync") Coroutine { sourceUri: String ->
      withContext(Dispatchers.Default) { measureFrame(sourceUri) }
    }

    AsyncFunction("processAsync") Coroutine {
        sourceUris: List<String>,
        mode: String,
        jpegQuality: Int ->
      withContext(Dispatchers.Default) {
        processFrames(sourceUris, mode, jpegQuality.coerceIn(80, 100))
      }
    }
  }

  private fun measureFrame(sourceUri: String): Map<String, Any> {
    val path = filePath(sourceUri)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Invalid scene image." }
    val orientation = ExifInterface(path).getAttributeInt(
      ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL,
    )
    val rotated = orientation in listOf(
      ExifInterface.ORIENTATION_TRANSPOSE, ExifInterface.ORIENTATION_ROTATE_90,
      ExifInterface.ORIENTATION_TRANSVERSE, ExifInterface.ORIENTATION_ROTATE_270,
    )
    val sourceWidth = if (rotated) bounds.outHeight else bounds.outWidth
    val sourceHeight = if (rotated) bounds.outWidth else bounds.outHeight
    val outputScale = min(1.0, maximumOutputEdge().toDouble() / max(sourceWidth, sourceHeight))
    val bitmap = decodeOrientedBitmap(path, ANALYSIS_EDGE)
      ?: throw IllegalArgumentException("The scene image could not be decoded.")
    val sampled = scaleDown(bitmap, ANALYSIS_EDGE)
    if (sampled !== bitmap) bitmap.recycle()
    try {
      val pixels = IntArray(sampled.width * sampled.height)
      sampled.getPixels(pixels, 0, sampled.width, 0, 0, sampled.width, sampled.height)
      val clipped = pixels.count { color ->
        max(max(color shr 16 and 0xff, color shr 8 and 0xff), color and 0xff) >= 250
      }
      return mapOf(
        "width" to max(1, (sourceWidth * outputScale).roundToInt()),
        "height" to max(1, (sourceHeight * outputScale).roundToInt()),
        "highlightClippingFraction" to clipped.toDouble() / pixels.size,
        "highlightSampleCount" to pixels.size,
        "highlightThreshold" to 250,
      )
    } finally {
      sampled.recycle()
    }
  }

  private fun processFrames(
    sourceUris: List<String>,
    mode: String,
    jpegQuality: Int,
  ): Map<String, Any> {
    require(mode in SUPPORTED_MODES) { "Unsupported multi-frame mode: $mode" }
    require(sourceUris.size >= 2) { "At least two frames are required." }

    val outputEdge = maximumOutputEdge()
    val referenceUri = sourceUris.first()
    val referenceBitmap = decodeOrientedBitmap(filePath(referenceUri))
      ?: throw IllegalArgumentException("The reference frame could not be decoded.")
    val preparedReference = scaleDown(referenceBitmap, outputEdge)
    if (preparedReference !== referenceBitmap) referenceBitmap.recycle()

    val width = preparedReference.width
    val height = preparedReference.height
    val outputPixels = IntArray(width * height)
    preparedReference.getPixels(outputPixels, 0, width, 0, 0, width, height)
    val referenceAnalysis = createAnalysisImage(preparedReference)
    preparedReference.recycle()

    val sampleCounts = if (mode == MODE_LIGHT_TRAIL) null else ByteArray(outputPixels.size) { 1 }
    val alignments = mutableListOf<Map<String, Any>>()
    alignments += alignmentMap(0, 0, 0, 0.0, true)
    var acceptedFrames = 1
    var cropLeft = 0
    var cropTop = 0
    var cropRight = width
    var cropBottom = height

    sourceUris.drop(1).forEachIndexed { frameOffset, sourceUri ->
      val frameIndex = frameOffset + 1
      var candidate: Bitmap? = null
      try {
        val decoded = decodeOrientedBitmap(filePath(sourceUri))
          ?: throw IllegalArgumentException("Frame $frameIndex could not be decoded.")
        val scaled = scaleDown(decoded, outputEdge)
        if (scaled !== decoded) decoded.recycle()
        val preparedCandidate = if (scaled.width == width && scaled.height == height) {
          scaled
        } else {
          Bitmap.createScaledBitmap(scaled, width, height, true).also {
            if (it !== scaled) scaled.recycle()
          }
        }
        candidate = preparedCandidate

        val candidateAnalysis = createAnalysisImage(preparedCandidate)
        val estimated = estimateTranslation(referenceAnalysis, candidateAnalysis)
        val offsetX = (estimated.offsetX * width.toDouble() / referenceAnalysis.width).roundToInt()
        val offsetY = (estimated.offsetY * height.toDouble() / referenceAnalysis.height).roundToInt()
        val motionScore = calculateMotionScore(
          referenceAnalysis,
          candidateAnalysis,
          estimated.offsetX,
          estimated.offsetY,
        )
        val accepted = shouldAcceptFrame(
          mode,
          estimated.correlation,
          estimated.atSearchBoundary,
          motionScore,
          offsetX,
          offsetY,
          width,
          height,
        )
        if (!accepted) {
          alignments += alignmentMap(frameIndex, offsetX, offsetY, motionScore, false)
          return@forEachIndexed
        }

        val candidatePixels = IntArray(width * height)
        preparedCandidate.getPixels(candidatePixels, 0, width, 0, 0, width, height)
        FrameBlender.blend(
          outputPixels,
          candidatePixels,
          sampleCounts,
          width,
          height,
          offsetX,
          offsetY,
          mode,
          STAR_PIXEL_MOTION_THRESHOLD,
          LIGHT_TRAIL_DELTA,
        )
        acceptedFrames += 1
        cropLeft = max(cropLeft, max(0, -offsetX))
        cropTop = max(cropTop, max(0, -offsetY))
        cropRight = min(cropRight, min(width, width - offsetX))
        cropBottom = min(cropBottom, min(height, height - offsetY))
        alignments += alignmentMap(frameIndex, offsetX, offsetY, motionScore, true)
      } catch (_: Throwable) {
        alignments += alignmentMap(frameIndex, 0, 0, 1.0, false, false)
      } finally {
        candidate?.let { if (!it.isRecycled) it.recycle() }
      }
    }

    if (acceptedFrames < 2 || cropRight <= cropLeft || cropBottom <= cropTop) {
      return resultMap(referenceUri, false, sourceUris.size, acceptedFrames, alignments)
    }

    val fullOutput = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    fullOutput.setPixels(outputPixels, 0, width, 0, 0, width, height)
    val croppedOutput = if (
      cropLeft == 0 && cropTop == 0 && cropRight == width && cropBottom == height
    ) {
      fullOutput
    } else {
      Bitmap.createBitmap(
        fullOutput,
        cropLeft,
        cropTop,
        cropRight - cropLeft,
        cropBottom - cropTop,
      ).also { fullOutput.recycle() }
    }

    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val outputFile = File(context.cacheDir, "intellicam-$mode-${UUID.randomUUID()}.jpg")
    try {
      FileOutputStream(outputFile).use { stream ->
        check(croppedOutput.compress(Bitmap.CompressFormat.JPEG, jpegQuality, stream)) {
          "The aligned photo could not be encoded."
        }
      }
    } finally {
      croppedOutput.recycle()
    }

    return resultMap(
      Uri.fromFile(outputFile).toString(),
      true,
      sourceUris.size,
      acceptedFrames,
      alignments,
    )
  }

  private fun estimateTranslation(reference: AnalysisImage, candidate: AnalysisImage): Translation {
    var bestCorrelation = -1.0
    var bestX = 0
    var bestY = 0
    for (offsetY in -MAX_ANALYSIS_SHIFT..MAX_ANALYSIS_SHIFT) {
      for (offsetX in -MAX_ANALYSIS_SHIFT..MAX_ANALYSIS_SHIFT) {
        val correlation = normalizedCorrelation(reference, candidate, offsetX, offsetY)
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation
          bestX = offsetX
          bestY = offsetY
        }
      }
    }
    return Translation(
      offsetX = bestX,
      offsetY = bestY,
      correlation = bestCorrelation,
      atSearchBoundary = abs(bestX) == MAX_ANALYSIS_SHIFT || abs(bestY) == MAX_ANALYSIS_SHIFT,
    )
  }

  private fun normalizedCorrelation(
    reference: AnalysisImage,
    candidate: AnalysisImage,
    offsetX: Int,
    offsetY: Int,
  ): Double {
    val startX = max(0, -offsetX)
    val endX = min(reference.width, candidate.width - offsetX)
    val startY = max(0, -offsetY)
    val endY = min(reference.height, candidate.height - offsetY)
    var count = 0L
    var sumReference = 0L
    var sumCandidate = 0L
    var sumReferenceSquared = 0L
    var sumCandidateSquared = 0L
    var sumProduct = 0L

    var y = startY
    while (y < endY) {
      var x = startX
      while (x < endX) {
        val referenceValue = reference.pixels[y * reference.width + x].toLong()
        val candidateValue = candidate.pixels[
          (y + offsetY) * candidate.width + x + offsetX
        ].toLong()
        count += 1
        sumReference += referenceValue
        sumCandidate += candidateValue
        sumReferenceSquared += referenceValue * referenceValue
        sumCandidateSquared += candidateValue * candidateValue
        sumProduct += referenceValue * candidateValue
        x += ANALYSIS_SAMPLE_STRIDE
      }
      y += ANALYSIS_SAMPLE_STRIDE
    }

    if (count < 64) return -1.0
    val numerator = count.toDouble() * sumProduct - sumReference.toDouble() * sumCandidate
    val referenceVariance = count.toDouble() * sumReferenceSquared - sumReference.toDouble() * sumReference
    val candidateVariance = count.toDouble() * sumCandidateSquared - sumCandidate.toDouble() * sumCandidate
    val denominator = sqrt(max(0.0, referenceVariance) * max(0.0, candidateVariance))
    return if (denominator <= 0.0001) -1.0 else numerator / denominator
  }

  private fun calculateMotionScore(
    reference: AnalysisImage,
    candidate: AnalysisImage,
    offsetX: Int,
    offsetY: Int,
  ): Double {
    val startX = max(0, -offsetX)
    val endX = min(reference.width, candidate.width - offsetX)
    val startY = max(0, -offsetY)
    val endY = min(reference.height, candidate.height - offsetY)
    var changed = 0
    var count = 0
    var y = startY
    while (y < endY) {
      var x = startX
      while (x < endX) {
        val referenceValue = reference.pixels[y * reference.width + x]
        val candidateValue = candidate.pixels[
          (y + offsetY) * candidate.width + x + offsetX
        ]
        if (abs(referenceValue - candidateValue) >= MOTION_LUMA_THRESHOLD) changed += 1
        count += 1
        x += MOTION_SAMPLE_STRIDE
      }
      y += MOTION_SAMPLE_STRIDE
    }
    return if (count == 0) 1.0 else changed.toDouble() / count
  }

  private fun shouldAcceptFrame(
    mode: String,
    correlation: Double,
    atSearchBoundary: Boolean,
    motionScore: Double,
    offsetX: Int,
    offsetY: Int,
    width: Int,
    height: Int,
  ): Boolean {
    val motionLimit = when (mode) {
      MODE_STAR -> 0.45
      MODE_LIGHT_TRAIL -> 0.72
      else -> 0.78
    }
    val excessiveOffset = abs(offsetX) > width * MAX_OUTPUT_SHIFT_FRACTION ||
      abs(offsetY) > height * MAX_OUTPUT_SHIFT_FRACTION
    return correlation >= MIN_ALIGNMENT_CORRELATION &&
      motionScore <= motionLimit &&
      !excessiveOffset &&
      !(atSearchBoundary && correlation < STRONG_ALIGNMENT_CORRELATION)
  }

  private fun luma(color: Int): Int = (
    54 * (color shr 16 and 0xff) +
      183 * (color shr 8 and 0xff) +
      19 * (color and 0xff)
    ) shr 8

  private fun createAnalysisImage(bitmap: Bitmap): AnalysisImage {
    val scale = min(1.0, ANALYSIS_EDGE.toDouble() / max(bitmap.width, bitmap.height))
    val width = max(1, (bitmap.width * scale).roundToInt())
    val height = max(1, (bitmap.height * scale).roundToInt())
    val scaled = if (width == bitmap.width && height == bitmap.height) {
      bitmap
    } else {
      Bitmap.createScaledBitmap(bitmap, width, height, true)
    }
    val colors = IntArray(width * height)
    scaled.getPixels(colors, 0, width, 0, 0, width, height)
    if (scaled !== bitmap) scaled.recycle()
    return AnalysisImage(width, height, IntArray(colors.size) { luma(colors[it]) })
  }

  private fun alignmentMap(
    index: Int,
    offsetX: Int,
    offsetY: Int,
    motionScore: Double,
    accepted: Boolean,
    registrationSucceeded: Boolean = true,
  ) = mapOf(
    "index" to index,
    "offsetX" to offsetX,
    "offsetY" to offsetY,
    "motionScore" to motionScore,
    "accepted" to accepted,
    "registrationSucceeded" to registrationSucceeded,
  )

  private fun resultMap(
    uri: String,
    applied: Boolean,
    inputFrameCount: Int,
    acceptedFrameCount: Int,
    alignments: List<Map<String, Any>>,
  ) = mapOf(
    "uri" to uri,
    "applied" to applied,
    "inputFrameCount" to inputFrameCount,
    "acceptedFrameCount" to acceptedFrameCount,
    "rejectedFrameCount" to inputFrameCount - acceptedFrameCount,
    "alignments" to alignments,
  )

  private fun filePath(uriString: String): String {
    val uri = Uri.parse(uriString)
    val path = if (uri.scheme == "file") uri.path else uriString
    require(!path.isNullOrBlank() && File(path).exists()) { "The frame file does not exist." }
    return path
  }

  private fun decodeOrientedBitmap(path: String, sampleEdge: Int? = null): Bitmap? {
    val options = BitmapFactory.Options().apply { inSampleSize = 1 }
    if (sampleEdge != null) {
      options.inJustDecodeBounds = true
      BitmapFactory.decodeFile(path, options)
      options.inJustDecodeBounds = false
      while (max(options.outWidth, options.outHeight) / (options.inSampleSize * 2) >= sampleEdge) {
        options.inSampleSize *= 2
      }
    }
    val decoded = BitmapFactory.decodeFile(path, options) ?: return null
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

  private fun maximumOutputEdge(): Int {
    val maximumHeapMb = Runtime.getRuntime().maxMemory() / (1024L * 1024L)
    return when {
      maximumHeapMb >= 512L -> HIGH_MEMORY_OUTPUT_EDGE
      maximumHeapMb >= 384L -> MID_MEMORY_OUTPUT_EDGE
      else -> BASE_OUTPUT_EDGE
    }
  }

  private data class AnalysisImage(val width: Int, val height: Int, val pixels: IntArray)
  private data class Translation(
    val offsetX: Int,
    val offsetY: Int,
    val correlation: Double,
    val atSearchBoundary: Boolean,
  )

  companion object {
    private const val MODE_STAR = "star"
    private const val MODE_LIGHT_TRAIL = "light-trail"
    private const val MODE_WATERFALL = "waterfall"
    private val SUPPORTED_MODES = setOf(MODE_STAR, MODE_LIGHT_TRAIL, MODE_WATERFALL)
    private const val BASE_OUTPUT_EDGE = 3072
    private const val MID_MEMORY_OUTPUT_EDGE = 3584
    private const val HIGH_MEMORY_OUTPUT_EDGE = 4096
    private const val ANALYSIS_EDGE = 256
    private const val MAX_ANALYSIS_SHIFT = 14
    private const val ANALYSIS_SAMPLE_STRIDE = 3
    private const val MOTION_SAMPLE_STRIDE = 2
    private const val MOTION_LUMA_THRESHOLD = 36
    private const val STAR_PIXEL_MOTION_THRESHOLD = 48
    private const val LIGHT_TRAIL_DELTA = 4
    private const val MIN_ALIGNMENT_CORRELATION = 0.22
    private const val STRONG_ALIGNMENT_CORRELATION = 0.58
    private const val MAX_OUTPUT_SHIFT_FRACTION = 0.12
  }
}
