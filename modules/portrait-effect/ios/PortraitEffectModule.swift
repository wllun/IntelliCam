import CoreImage
import ExpoModulesCore
import ImageIO
import Vision

public final class PortraitEffectModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PortraitEffect")

    AsyncFunction("applyAsync") { (sourceURI: String, jpegQuality: Int) throws -> [String: Any] in
      return try self.applyPortraitEffect(sourceURI: sourceURI, jpegQuality: jpegQuality)
    }
  }

  private func fileURL(_ value: String) throws -> URL {
    let url = URL(string: value)?.isFileURL == true
      ? URL(string: value)!
      : URL(fileURLWithPath: value)
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw NSError(domain: "PortraitEffect", code: 1, userInfo: [NSLocalizedDescriptionKey: "The captured photo does not exist."])
    }
    return url
  }

  private func applyPortraitEffect(sourceURI: String, jpegQuality: Int) throws -> [String: Any] {
    let sourceURL = try fileURL(sourceURI)
    guard var image = CIImage(
      contentsOf: sourceURL,
      options: [.applyOrientationProperty: true]
    ) else {
      throw NSError(domain: "PortraitEffect", code: 2, userInfo: [NSLocalizedDescriptionKey: "The captured photo could not be decoded."])
    }

    let maximumEdge: CGFloat = 4096
    let longestEdge = max(image.extent.width, image.extent.height)
    if longestEdge > maximumEdge {
      let scale = maximumEdge / longestEdge
      image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    }
    image = image.transformed(by: CGAffineTransform(
      translationX: -image.extent.origin.x,
      y: -image.extent.origin.y
    ))

    let humanRequest = VNDetectHumanRectanglesRequest()
    humanRequest.upperBodyOnly = false
    let humanHandler = VNImageRequestHandler(ciImage: image, orientation: .up)
    try humanHandler.perform([humanRequest])
    guard !(humanRequest.results ?? []).isEmpty else {
      return ["uri": sourceURI, "applied": false]
    }

    let segmentationRequest = VNGeneratePersonSegmentationRequest()
    segmentationRequest.qualityLevel = .accurate
    segmentationRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8
    let handler = VNImageRequestHandler(ciImage: image, orientation: .up)
    try handler.perform([segmentationRequest])
    guard let pixelBuffer = segmentationRequest.results?.first?.pixelBuffer else {
      return ["uri": sourceURI, "applied": false]
    }

    var mask = CIImage(cvPixelBuffer: pixelBuffer)
    mask = mask.transformed(by: CGAffineTransform(
      scaleX: image.extent.width / mask.extent.width,
      y: image.extent.height / mask.extent.height
    )).cropped(to: image.extent)
    let background = image
      .clampedToExtent()
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 22])
      .cropped(to: image.extent)
    let portrait = image.applyingFilter("CIBlendWithMask", parameters: [
      kCIInputBackgroundImageKey: background,
      kCIInputMaskImageKey: mask,
    ])

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let context = CIContext(options: [.cacheIntermediates: false])
    let quality = Double(min(max(jpegQuality, 80), 100)) / 100
    let qualityKey = CIImageRepresentationOption(
      rawValue: kCGImageDestinationLossyCompressionQuality as String
    )
    guard let data = context.jpegRepresentation(
      of: portrait,
      colorSpace: colorSpace,
      options: [qualityKey: quality]
    ) else {
      throw NSError(domain: "PortraitEffect", code: 3, userInfo: [NSLocalizedDescriptionKey: "The portrait photo could not be encoded."])
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("intellicam-portrait-\(UUID().uuidString).jpg")
    try data.write(to: outputURL, options: .atomic)
    return ["uri": outputURL.absoluteString, "applied": true]
  }
}
