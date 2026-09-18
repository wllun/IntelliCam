package expo.modules.multiframeprocessor

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

/** Tiny preview grid only. Never changes full-quality capture pixels. */
internal class PreviewSceneAnalyzer {
  private data class Sample(val key: String, val time: Double, val width: Int, val height: Int,
    val luma: IntArray, val centerX: Double?, val centerY: Double?)
  private var previous: Sample? = null

  @Synchronized
  fun analyze(colors: IntArray, width: Int, height: Int, key: String, time: Double): Map<String, Any?> {
    val luma = IntArray(colors.size) { index ->
      val color = colors[index]
      (54 * (color shr 16 and 255) + 183 * (color shr 8 and 255) + 19 * (color and 255)) shr 8
    }
    var clipped = 0
    var lightCount = 0
    var centerX = 0.0
    var centerY = 0.0
    var sum = 0.0
    var squared = 0.0
    for (index in colors.indices) {
      val color = colors[index]
      if (max(max(color shr 16 and 255, color shr 8 and 255), color and 255) >= 250) clipped++
      val value = luma[index]
      sum += value
      squared += value.toDouble() * value
      if (value >= 200) {
        lightCount++
        centerX += (index % width).toDouble() / width
        centerY += (index / width).toDouble() / height
      }
    }
    val mean = sum / colors.size
    val texture = sqrt(max(0.0, squared / colors.size - mean * mean)) / 255
    val cx = if (lightCount >= 3) centerX / lightCount else null
    val cy = if (lightCount >= 3) centerY / lightCount else null
    val old = previous?.takeIf { it.key == key && it.width == width && it.height == height
      && time - it.time in 150.0..1800.0 }
    var displacement: Double? = null
    var motion: Double? = null
    var lightMotion: Double? = null
    var lightSpeed: Double? = null
    if (old != null && texture >= 0.035) {
      // Exclude very bright light sources from background registration. A large
      // ambiguous residual/boundary match is unknown, never falsely marked steady.
      var bestError = Double.MAX_VALUE
      var secondError = Double.MAX_VALUE
      var bestX = 0
      var bestY = 0
      for (dy in -4..4) for (dx in -4..4) {
        var error = 0.0
        var count = 0
        for (y in 4 until height - 4 step 2) for (x in 4 until width - 4 step 2) {
          val a = old.luma[y * width + x]
          val b = luma[(y + dy) * width + x + dx]
          if (a < 200 && b < 200) { error += abs(a - b); count++ }
        }
        if (count >= 64) {
          val score = error / count
          if (score < bestError) {
            secondError = bestError
            bestError = score
            bestX = dx
            bestY = dy
          } else if (score < secondError) secondError = score
        }
      }
      if (bestError < 35 && secondError - bestError > 0.5 && abs(bestX) < 4 && abs(bestY) < 4) {
        displacement = sqrt(bestX.toDouble() * bestX + bestY.toDouble() * bestY) / max(width, height)
        var changed = 0
        var lightsChanged = 0
        var lights = 0
        var count = 0
        for (y in 4 until height - 4) for (x in 4 until width - 4) {
          val a = old.luma[y * width + x]
          val b = luma[(y + bestY) * width + x + bestX]
          if (abs(a - b) >= 24) changed++
          if (a >= 200 || b >= 200) {
            lights++
            if (abs(a - b) >= 24) lightsChanged++
          }
          count++
        }
        motion = changed.toDouble() / max(1, count)
        lightMotion = if (lights >= 3) lightsChanged.toDouble() / lights else null
        if (cx != null && cy != null && old.centerX != null && old.centerY != null) {
          val dx = cx - old.centerX - bestX.toDouble() / width
          val dy = cy - old.centerY - bestY.toDouble() / height
          lightSpeed = sqrt(dx * dx + dy * dy) / ((time - old.time) / 1000)
        }
      }
    }
    previous = Sample(key, time, width, height, luma, cx, cy)
    return mapOf("meanLuma" to mean / 255, "highlightFraction" to clipped.toDouble() / colors.size,
      "texture" to texture, "subjectMotion" to motion, "lightMotion" to lightMotion,
      "lightSpeed" to lightSpeed, "displacement" to displacement)
  }
}
