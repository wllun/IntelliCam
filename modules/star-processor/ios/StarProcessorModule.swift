import CoreImage
import ExpoModulesCore
import ImageIO

public final class StarProcessorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StarProcessor")

    AsyncFunction("stackAverageAsync") { (sourceURIs: [String], jpegQuality: Int) throws -> [String: Any] in
      return try self.stackAverage(sourceURIs: sourceURIs, jpegQuality: jpegQuality)
    }
  }

  private func stackAverage(sourceURIs: [String], jpegQuality: Int) throws -> [String: Any] {
    guard sourceURIs.count >= 2 && sourceURIs.count <= 8 else {
      throw NSError(domain: "StarProcessor", code: 1, userInfo: [NSLocalizedDescriptionKey: "Star stacking requires between 2 and 8 frames."])
    }

    let images = try sourceURIs.map { value -> CIImage in
      let url = URL(string: value)?.isFileURL == true
        ? URL(string: value)!
        : URL(fileURLWithPath: value)
      guard let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
        throw NSError(domain: "StarProcessor", code: 2, userInfo: [NSLocalizedDescriptionKey: "A Star frame could not be decoded."])
      }
      return image
    }

    let sourceExtent = images[0].extent
    let longestEdge = max(sourceExtent.width, sourceExtent.height)
    let outputScale = longestEdge > 4096 ? 4096 / longestEdge : 1
    let outputExtent = CGRect(
      x: 0,
      y: 0,
      width: sourceExtent.width * outputScale,
      height: sourceExtent.height * outputScale
    )

    func normalized(_ image: CIImage) -> CIImage {
      let xScale = outputExtent.width / image.extent.width
      let yScale = outputExtent.height / image.extent.height
      return image
        .transformed(by: CGAffineTransform(translationX: -image.extent.origin.x, y: -image.extent.origin.y))
        .transformed(by: CGAffineTransform(scaleX: xScale, y: yScale))
        .cropped(to: outputExtent)
    }

    var accumulated = normalized(images[0])
    for image in images.dropFirst() {
      accumulated = normalized(image)
        .applyingFilter("CIAdditionCompositing", parameters: [
          kCIInputBackgroundImageKey: accumulated,
        ])
        .cropped(to: outputExtent)
    }

    let factor = CGFloat(1) / CGFloat(images.count)
    let averaged = accumulated.applyingFilter("CIColorMatrix", parameters: [
      "inputRVector": CIVector(x: factor, y: 0, z: 0, w: 0),
      "inputGVector": CIVector(x: 0, y: factor, z: 0, w: 0),
      "inputBVector": CIVector(x: 0, y: 0, z: factor, w: 0),
      "inputAVector": CIVector(x: 0, y: 0, z: 0, w: factor),
    ]).cropped(to: outputExtent)

    let context = CIContext(options: [.cacheIntermediates: false])
    let quality = Double(min(max(jpegQuality, 80), 100)) / 100
    let qualityKey = CIImageRepresentationOption(
      rawValue: kCGImageDestinationLossyCompressionQuality as String
    )
    guard let data = context.jpegRepresentation(
      of: averaged,
      colorSpace: CGColorSpaceCreateDeviceRGB(),
      options: [qualityKey: quality]
    ) else {
      throw NSError(domain: "StarProcessor", code: 3, userInfo: [NSLocalizedDescriptionKey: "The stacked Star photo could not be encoded."])
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("intellicam-star-\(UUID().uuidString).jpg")
    try data.write(to: outputURL, options: .atomic)
    return ["uri": outputURL.absoluteString, "frameCount": sourceURIs.count]
  }
}
