package expo.modules.multiframeprocessor

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Same pixel math as the original blender, without unused luminance calculations. */
internal object FrameBlender {
  fun blend(
    output: IntArray,
    candidate: IntArray,
    counts: ByteArray?,
    width: Int,
    height: Int,
    offsetX: Int,
    offsetY: Int,
    mode: String,
    starMotionThreshold: Int,
    lightTrailDelta: Int,
  ) {
    val operation = when (mode) {
      "star" -> 0
      "light-trail" -> 1
      "waterfall" -> 2
      else -> error("Unsupported blend mode: $mode")
    }
    val startX = max(0, -offsetX)
    val endX = min(width, width - offsetX)
    val startY = max(0, -offsetY)
    val endY = min(height, height - offsetY)
    for (y in startY until endY) {
      val outputRow = y * width
      val candidateRow = (y + offsetY) * width + offsetX
      for (x in startX until endX) {
        val outputIndex = outputRow + x
        val candidateColor = candidate[candidateRow + x]
        val outputColor = output[outputIndex]
        when (operation) {
          0 -> if (abs(luma(candidateColor) - luma(outputColor)) <= starMotionThreshold) {
            output[outputIndex] = averageColor(
              outputColor, candidateColor, incrementCount(counts!!, outputIndex),
            )
          }
          1 -> if (luma(candidateColor) > luma(outputColor) + lightTrailDelta) {
            output[outputIndex] = candidateColor
          }
          2 -> {
            output[outputIndex] = averageColor(
              outputColor, candidateColor, incrementCount(counts!!, outputIndex),
            )
          }
        }
      }
    }
  }

  private fun incrementCount(counts: ByteArray, index: Int): Int {
    val count = (counts[index].toInt() and 0xff).coerceAtLeast(1) + 1
    counts[index] = count.coerceAtMost(255).toByte()
    return count
  }

  private fun averageColor(existing: Int, next: Int, count: Int): Int {
    val previousCount = count - 1
    val red = ((existing shr 16 and 0xff) * previousCount + (next shr 16 and 0xff)) / count
    val green = ((existing shr 8 and 0xff) * previousCount + (next shr 8 and 0xff)) / count
    val blue = ((existing and 0xff) * previousCount + (next and 0xff)) / count
    return (0xff shl 24) or (red shl 16) or (green shl 8) or blue
  }

  private fun luma(color: Int): Int = (
    54 * (color shr 16 and 0xff) +
      183 * (color shr 8 and 0xff) +
      19 * (color and 0xff)
    ) shr 8
}
