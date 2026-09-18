import CoreGraphics
import CoreImage
import CoreMotion
import ExpoModulesCore
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

public final class MultiFrameProcessorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MultiFrameProcessor")

    AsyncFunction("sampleMotionAsync") { () -> [String: Any] in
      let motion = CMMotionManager()
      guard motion.isGyroAvailable else { return ["gyroRms": NSNull(), "gyroSamples": 0] }
      let lock = NSLock()
      var squared = 0.0
      var samples = 0
      let queue = OperationQueue()
      queue.maxConcurrentOperationCount = 1
      motion.gyroUpdateInterval = 0.05
      motion.startGyroUpdates(to: queue) { data, _ in
        guard let rate = data?.rotationRate else { return }
        lock.lock()
        squared += rate.x * rate.x + rate.y * rate.y + rate.z * rate.z
        samples += 1
        lock.unlock()
      }
      defer { motion.stopGyroUpdates() }
      Thread.sleep(forTimeInterval: 0.3)
      lock.lock()
      defer { lock.unlock() }
      return ["gyroRms": samples >= 3 ? sqrt(squared / Double(samples)) as Any : NSNull(),
        "gyroSamples": samples]
    }

    AsyncFunction("measureAsync") { (sourceURI: String) throws -> [String: Any] in
      return try self.measureFrame(sourceURI)
    }

    AsyncFunction("processAsync") { (sourceURIs: [String], mode: String, jpegQuality: Int) throws -> [String: Any] in
      return try self.processFrames(
        sourceURIs: sourceURIs,
        mode: mode,
        jpegQuality: min(max(jpegQuality, 80), 100)
      )
    }
  }

  private func measureFrame(_ sourceURI: String) throws -> [String: Any] {
    let image = try preparedImage(sourceURI)
    let referenceWidth = Int(image.extent.width.rounded(.down))
    let referenceHeight = Int(image.extent.height.rounded(.down))
    let scale = min(1, 256 / max(image.extent.width, image.extent.height))
    let sampled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let width = max(1, Int(sampled.extent.width.rounded(.down)))
    let height = max(1, Int(sampled.extent.height.rounded(.down)))
    let pixels = try renderRGBA(
      sampled, width: width, height: height,
      context: CIContext(options: [.cacheIntermediates: false])
    )
    var clipped = 0
    for pixel in 0..<(width * height) {
      let offset = pixel * 4
      if max(max(pixels[offset], pixels[offset + 1]), pixels[offset + 2]) >= 250 {
        clipped += 1
      }
    }
    return [
      "width": referenceWidth,
      "height": referenceHeight,
      "highlightClippingFraction": Double(clipped) / Double(width * height),
      "highlightSampleCount": width * height,
      "highlightThreshold": 250,
    ]
  }

  private func processFrames(
    sourceURIs: [String],
    mode: String,
    jpegQuality: Int
  ) throws -> [String: Any] {
    guard Self.supportedModes.contains(mode) else {
      throw processingError(1, "Unsupported multi-frame mode: \(mode)")
    }
    guard sourceURIs.count >= 2 else {
      throw processingError(2, "At least two frames are required.")
    }

    let referenceURI = sourceURIs[0]
    let reference = try preparedImage(referenceURI)
    let width = Int(reference.extent.width.rounded(.down))
    let height = Int(reference.extent.height.rounded(.down))
    guard width > 0 && height > 0 else {
      throw processingError(3, "The reference frame has invalid dimensions.")
    }

    let context = CIContext(options: [.cacheIntermediates: false])
    let referencePixels = try renderRGBA(reference, width: width, height: height, context: context)
    var outputPixels = referencePixels
    var sampleCounts = mode == Self.lightTrailMode
      ? []
      : [UInt8](repeating: 1, count: width * height)
    var alignments: [[String: Any]] = [alignmentMap(
      index: 0,
      offsetX: 0,
      offsetY: 0,
      motionScore: 0,
      accepted: true
    )]
    var acceptedFrames = 1
    var commonExtent = reference.extent

    for (frameIndex, sourceURI) in sourceURIs.dropFirst().enumerated() {
      let actualIndex = frameIndex + 1
      do {
        let rawCandidate = try preparedImage(sourceURI)
        let sizeTransform = CGAffineTransform(
          scaleX: reference.extent.width / rawCandidate.extent.width,
          y: reference.extent.height / rawCandidate.extent.height
        )
        let candidate = rawCandidate
          .transformed(by: sizeTransform)
          .transformed(by: CGAffineTransform(
            translationX: -rawCandidate.extent.origin.x * sizeTransform.a,
            y: -rawCandidate.extent.origin.y * sizeTransform.d
          ))

        let registration = VNTranslationalImageRegistrationRequest(
          targetedCIImage: candidate,
          options: [:]
        )
        let handler = VNImageRequestHandler(ciImage: reference, options: [:])
        try handler.perform([registration])
        guard let observation = registration.results?.first else {
          throw processingError(4, "Frame alignment did not return a result.")
        }

        let transform = observation.alignmentTransform
        let aligned = candidate.transformed(by: transform)
        let alignedPixels = try renderRGBA(
          aligned,
          width: width,
          height: height,
          context: context
        )
        let motionScore = calculateMotionScore(
          reference: referencePixels,
          candidate: alignedPixels
        )
        let accepted = shouldAcceptFrame(
          mode: mode,
          motionScore: motionScore,
          transform: transform,
          width: width,
          height: height
        )
        alignments.append(alignmentMap(
          index: actualIndex,
          offsetX: Int(transform.tx.rounded()),
          offsetY: Int(transform.ty.rounded()),
          motionScore: motionScore,
          accepted: accepted
        ))
        if !accepted { continue }

        blendFrame(
          output: &outputPixels,
          reference: referencePixels,
          candidate: alignedPixels,
          counts: &sampleCounts,
          mode: mode
        )
        acceptedFrames += 1
        commonExtent = commonExtent.intersection(candidate.extent.applying(transform))
      } catch {
        alignments.append(alignmentMap(
          index: actualIndex,
          offsetX: 0,
          offsetY: 0,
          motionScore: 1,
          accepted: false,
          registrationSucceeded: false
        ))
      }
    }

    guard acceptedFrames >= 2, !commonExtent.isNull, !commonExtent.isEmpty else {
      return resultMap(
        uri: referenceURI,
        applied: false,
        inputFrameCount: sourceURIs.count,
        acceptedFrameCount: acceptedFrames,
        alignments: alignments
      )
    }

    let left = max(0, Int(floor(commonExtent.minX)))
    let right = min(width, Int(ceil(commonExtent.maxX)))
    let top = max(0, height - Int(ceil(commonExtent.maxY)))
    let bottom = min(height, height - Int(floor(commonExtent.minY)))
    guard right > left, bottom > top else {
      return resultMap(
        uri: referenceURI,
        applied: false,
        inputFrameCount: sourceURIs.count,
        acceptedFrameCount: acceptedFrames,
        alignments: alignments
      )
    }

    let croppedWidth = right - left
    let croppedHeight = bottom - top
    let croppedPixels = cropPixels(
      outputPixels,
      sourceWidth: width,
      left: left,
      top: top,
      width: croppedWidth,
      height: croppedHeight
    )
    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("intellicam-\(mode)-\(UUID().uuidString).jpg")
    try writeJPEG(
      croppedPixels,
      width: croppedWidth,
      height: croppedHeight,
      quality: jpegQuality,
      to: outputURL
    )

    return resultMap(
      uri: outputURL.absoluteString,
      applied: true,
      inputFrameCount: sourceURIs.count,
      acceptedFrameCount: acceptedFrames,
      alignments: alignments
    )
  }

  private func preparedImage(_ value: String) throws -> CIImage {
    let url = try fileURL(value)
    guard var image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
      throw processingError(5, "A captured frame could not be decoded.")
    }
    let longestEdge = max(image.extent.width, image.extent.height)
    if longestEdge > Self.maximumOutputEdge {
      let scale = Self.maximumOutputEdge / longestEdge
      image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    }
    return image.transformed(by: CGAffineTransform(
      translationX: -image.extent.origin.x,
      y: -image.extent.origin.y
    ))
  }

  private func fileURL(_ value: String) throws -> URL {
    let url = URL(string: value)?.isFileURL == true
      ? URL(string: value)!
      : URL(fileURLWithPath: value)
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw processingError(6, "A captured frame does not exist.")
    }
    return url
  }

  private func renderRGBA(
    _ image: CIImage,
    width: Int,
    height: Int,
    context: CIContext
  ) throws -> [UInt8] {
    let bounds = CGRect(x: 0, y: 0, width: width, height: height)
    guard let cgImage = context.createCGImage(image, from: bounds) else {
      throw processingError(7, "An aligned frame could not be rendered.")
    }
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let created = pixels.withUnsafeMutableBytes { bytes -> Bool in
      guard let bitmapContext = CGContext(
        data: bytes.baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ) else { return false }
      bitmapContext.translateBy(x: 0, y: CGFloat(height))
      bitmapContext.scaleBy(x: 1, y: -1)
      bitmapContext.draw(cgImage, in: bounds)
      return true
    }
    guard created else {
      throw processingError(8, "An aligned bitmap could not be allocated.")
    }
    return pixels
  }

  private func calculateMotionScore(reference: [UInt8], candidate: [UInt8]) -> Double {
    var changed = 0
    var count = 0
    var pixel = 0
    while pixel < reference.count / 4 {
      let offset = pixel * 4
      if candidate[offset + 3] > 127 {
        let referenceLuma = luma(reference, offset)
        let candidateLuma = luma(candidate, offset)
        if abs(referenceLuma - candidateLuma) >= Self.motionLumaThreshold {
          changed += 1
        }
        count += 1
      }
      pixel += Self.motionSampleStride
    }
    return count == 0 ? 1 : Double(changed) / Double(count)
  }

  private func shouldAcceptFrame(
    mode: String,
    motionScore: Double,
    transform: CGAffineTransform,
    width: Int,
    height: Int
  ) -> Bool {
    let motionLimit: Double
    switch mode {
    case Self.starMode: motionLimit = 0.45
    case Self.lightTrailMode: motionLimit = 0.72
    default: motionLimit = 0.78
    }
    return motionScore <= motionLimit &&
      abs(transform.tx) <= CGFloat(width) * Self.maximumOutputShiftFraction &&
      abs(transform.ty) <= CGFloat(height) * Self.maximumOutputShiftFraction
  }

  private func blendFrame(
    output: inout [UInt8],
    reference: [UInt8],
    candidate: [UInt8],
    counts: inout [UInt8],
    mode: String
  ) {
    for pixel in 0..<(output.count / 4) {
      let offset = pixel * 4
      if candidate[offset + 3] <= 127 { continue }
      let outputLuma = luma(output, offset)
      let candidateLuma = luma(candidate, offset)

      switch mode {
      case Self.starMode:
        let referenceLuma = luma(reference, offset)
        if abs(referenceLuma - candidateLuma) <= Self.starPixelMotionThreshold {
          averagePixel(output: &output, candidate: candidate, counts: &counts, pixel: pixel)
        }
      case Self.lightTrailMode:
        if candidateLuma > outputLuma + Self.lightTrailDelta {
          output[offset] = candidate[offset]
          output[offset + 1] = candidate[offset + 1]
          output[offset + 2] = candidate[offset + 2]
          output[offset + 3] = 255
        }
      default:
        averagePixel(output: &output, candidate: candidate, counts: &counts, pixel: pixel)
      }
    }
  }

  private func averagePixel(
    output: inout [UInt8],
    candidate: [UInt8],
    counts: inout [UInt8],
    pixel: Int
  ) {
    let offset = pixel * 4
    let previousCount = max(1, Int(counts[pixel]))
    let nextCount = min(255, previousCount + 1)
    for channel in 0..<3 {
      let total = Int(output[offset + channel]) * previousCount + Int(candidate[offset + channel])
      output[offset + channel] = UInt8(total / nextCount)
    }
    output[offset + 3] = 255
    counts[pixel] = UInt8(nextCount)
  }

  private func luma(_ pixels: [UInt8], _ offset: Int) -> Int {
    return (
      54 * Int(pixels[offset]) +
      183 * Int(pixels[offset + 1]) +
      19 * Int(pixels[offset + 2])
    ) >> 8
  }

  private func cropPixels(
    _ source: [UInt8],
    sourceWidth: Int,
    left: Int,
    top: Int,
    width: Int,
    height: Int
  ) -> [UInt8] {
    var output = [UInt8](repeating: 0, count: width * height * 4)
    let sourceRowBytes = sourceWidth * 4
    let targetRowBytes = width * 4
    for row in 0..<height {
      let sourceStart = (top + row) * sourceRowBytes + left * 4
      let targetStart = row * targetRowBytes
      output.replaceSubrange(
        targetStart..<(targetStart + targetRowBytes),
        with: source[sourceStart..<(sourceStart + targetRowBytes)]
      )
    }
    return output
  }

  private func writeJPEG(
    _ pixels: [UInt8],
    width: Int,
    height: Int,
    quality: Int,
    to url: URL
  ) throws {
    let data = Data(pixels)
    guard let provider = CGDataProvider(data: data as CFData),
          let image = CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
          ),
          let destination = CGImageDestinationCreateWithURL(
            url as CFURL,
            UTType.jpeg.identifier as CFString,
            1,
            nil
          ) else {
      throw processingError(9, "The aligned photo could not be encoded.")
    }
    CGImageDestinationAddImage(
      destination,
      image,
      [kCGImageDestinationLossyCompressionQuality: Double(quality) / 100] as CFDictionary
    )
    guard CGImageDestinationFinalize(destination) else {
      throw processingError(10, "The aligned photo could not be saved.")
    }
  }

  private func alignmentMap(
    index: Int,
    offsetX: Int,
    offsetY: Int,
    motionScore: Double,
    accepted: Bool,
    registrationSucceeded: Bool = true
  ) -> [String: Any] {
    return [
      "index": index,
      "offsetX": offsetX,
      "offsetY": offsetY,
      "motionScore": motionScore,
      "accepted": accepted,
      "registrationSucceeded": registrationSucceeded,
    ]
  }

  private func resultMap(
    uri: String,
    applied: Bool,
    inputFrameCount: Int,
    acceptedFrameCount: Int,
    alignments: [[String: Any]]
  ) -> [String: Any] {
    return [
      "uri": uri,
      "applied": applied,
      "inputFrameCount": inputFrameCount,
      "acceptedFrameCount": acceptedFrameCount,
      "rejectedFrameCount": inputFrameCount - acceptedFrameCount,
      "alignments": alignments,
    ]
  }

  private func processingError(_ code: Int, _ message: String) -> NSError {
    return NSError(
      domain: "MultiFrameProcessor",
      code: code,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }

  private static let starMode = "star"
  private static let lightTrailMode = "light-trail"
  private static let waterfallMode = "waterfall"
  private static let supportedModes = Set([starMode, lightTrailMode, waterfallMode])
  private static let maximumOutputEdge: CGFloat = 3072
  private static let maximumOutputShiftFraction: CGFloat = 0.12
  private static let motionLumaThreshold = 36
  private static let motionSampleStride = 8
  private static let starPixelMotionThreshold = 48
  private static let lightTrailDelta = 4
}
