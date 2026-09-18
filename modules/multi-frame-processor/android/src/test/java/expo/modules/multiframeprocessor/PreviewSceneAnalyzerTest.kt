package expo.modules.multiframeprocessor

import org.junit.Assert.*
import org.junit.Test
import java.util.Random

class PreviewSceneAnalyzerTest {
  private fun gray(value: Int) = (255 shl 24) or (value shl 16) or (value shl 8) or value
  private val width = 96
  private val height = 72
  private fun pattern(): IntArray {
    val random = Random(42)
    return IntArray(width * height) { gray(30 + random.nextInt(140)) }
  }

  @Test fun darkBlankSceneHasUnknownMotion() {
    val analyzer = PreviewSceneAnalyzer()
    val blank = IntArray(width * height) { gray(0) }
    analyzer.analyze(blank, width, height, "camera", 1000.0)
    val result = analyzer.analyze(blank, width, height, "camera", 1800.0)
    assertEquals(0.0, result["meanLuma"])
    assertEquals(0.0, result["texture"])
    assertNull(result["displacement"])
    assertNull(result["subjectMotion"])
  }

  @Test fun unchangedTextureIsRegisteredAndContextChangesInvalidateMotion() {
    val analyzer = PreviewSceneAnalyzer()
    val image = pattern()
    analyzer.analyze(image, width, height, "camera", 1000.0)
    val same = analyzer.analyze(image, width, height, "camera", 1800.0)
    assertEquals(0.0, same["subjectMotion"])
    assertEquals(0.0, same["displacement"])
    assertNull(analyzer.analyze(image, width, height, "other-camera", 2600.0)["subjectMotion"])
    assertNull(analyzer.analyze(image, width, height, "other-camera", 6000.0)["subjectMotion"])
  }

  @Test fun clippingAndMovingLightAreMeasuredSeparatelyFromBackground() {
    val analyzer = PreviewSceneAnalyzer()
    val first = pattern()
    val second = first.copyOf()
    for (y in 20..24) for (x in 20..24) first[y * width + x] = gray(255)
    for (y in 20..24) for (x in 28..32) second[y * width + x] = gray(255)
    analyzer.analyze(first, width, height, "camera", 1000.0)
    val result = analyzer.analyze(second, width, height, "camera", 1800.0)
    assertEquals(25.0 / (width * height), result["highlightFraction"])
    assertEquals(0.0, result["displacement"])
    assertTrue((result["lightMotion"] as Double) > 0.5)
    assertTrue((result["lightSpeed"] as Double) > 0.05)
  }
}
