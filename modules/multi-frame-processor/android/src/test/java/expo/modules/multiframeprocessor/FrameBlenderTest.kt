package expo.modules.multiframeprocessor

import org.junit.Assert.assertArrayEquals
import org.junit.Test
import java.util.Random
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class FrameBlenderTest {
  @Test
  fun optimizedBlendingMatchesOriginalPixelsAndCounts() {
    val random = Random(20260918)
    val width = 41
    val height = 29
    for (mode in listOf("star", "light-trail", "waterfall")) {
      for (offsetX in listOf(-7, 0, 5, width)) {
        for (offsetY in listOf(-4, 0, 6, height)) {
          val expected = IntArray(width * height) { random.nextInt() }
          val actual = expected.copyOf()
          // Exercise normal counts, zero, unsigned values and count saturation.
          val expectedCounts = if (mode == "light-trail") null else
            ByteArray(expected.size) { listOf(0, 1, 2, 127, 254, 255)[it % 6].toByte() }
          val actualCounts = expectedCounts?.copyOf()
          repeat(8) {
            val candidate = IntArray(expected.size) { random.nextInt() }
            originalBlend(expected, candidate, expectedCounts, width, height, offsetX, offsetY, mode)
            FrameBlender.blend(actual, candidate, actualCounts, width, height, offsetX, offsetY, mode, 48, 4)
            assertArrayEquals("$mode ($offsetX, $offsetY), frame $it", expected, actual)
            if (expectedCounts != null) assertArrayEquals(expectedCounts, actualCounts)
          }
        }
      }
    }
  }

  @Test
  fun luminanceThresholdBoundariesAreUnchanged() {
    fun gray(value: Int) = (0xff shl 24) or (value shl 16) or (value shl 8) or value
    val original = IntArray(6) { gray(100) }
    val candidate = intArrayOf(104, 105, 148, 149, 52, 51).map(::gray).toIntArray()
    for (mode in listOf("star", "light-trail", "waterfall")) {
      val expected = original.copyOf()
      val actual = original.copyOf()
      val expectedCounts = if (mode == "light-trail") null else ByteArray(6) { 1 }
      val actualCounts = expectedCounts?.copyOf()
      originalBlend(expected, candidate, expectedCounts, 6, 1, 0, 0, mode)
      FrameBlender.blend(actual, candidate, actualCounts, 6, 1, 0, 0, mode, 48, 4)
      assertArrayEquals(expected, actual)
      if (expectedCounts != null) assertArrayEquals(expectedCounts, actualCounts)
    }
  }

  // Retained pre-optimization algorithm: use it as a bit-for-bit quality regression oracle.
  private fun originalBlend(
    output: IntArray, candidate: IntArray, counts: ByteArray?, width: Int, height: Int,
    offsetX: Int, offsetY: Int, mode: String,
  ) {
    for (y in max(0, -offsetY) until min(height, height - offsetY)) {
      for (x in max(0, -offsetX) until min(width, width - offsetX)) {
        val index = y * width + x
        val next = candidate[(y + offsetY) * width + x + offsetX]
        val previous = output[index]
        val difference = abs(luma(next) - luma(previous))
        when (mode) {
          "star" -> if (difference <= 48) output[index] = average(previous, next, increment(counts!!, index))
          "light-trail" -> if (luma(next) > luma(previous) + 4) output[index] = next
          "waterfall" -> output[index] = average(previous, next, increment(counts!!, index))
        }
      }
    }
  }

  private fun increment(counts: ByteArray, index: Int): Int {
    val count = (counts[index].toInt() and 0xff).coerceAtLeast(1) + 1
    counts[index] = count.coerceAtMost(255).toByte()
    return count
  }

  private fun average(previous: Int, next: Int, count: Int): Int {
    val red = ((previous shr 16 and 0xff) * (count - 1) + (next shr 16 and 0xff)) / count
    val green = ((previous shr 8 and 0xff) * (count - 1) + (next shr 8 and 0xff)) / count
    val blue = ((previous and 0xff) * (count - 1) + (next and 0xff)) / count
    return (0xff shl 24) or (red shl 16) or (green shl 8) or blue
  }

  private fun luma(color: Int) = (
    54 * (color shr 16 and 0xff) + 183 * (color shr 8 and 0xff) + 19 * (color and 0xff)
    ) shr 8
}
