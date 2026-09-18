import CoreImage
import ExpoModulesCore
import ImageIO
import Vision

public final class PortraitEffectModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PortraitEffect")
    Constants(["subjectSegmentationVersion": 2])

    AsyncFunction("prepareAsync") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    AsyncFunction("applyAsync") { (sourceURI: String, jpegQuality: Int, focusX: Double, focusY: Double) throws -> [String: Any] in
      return try self.applyPortraitEffect(
        sourceURI: sourceURI,
        jpegQuality: jpegQuality,
        focusX: focusX,
        focusY: focusY
      )
    }

    AsyncFunction("applyBeautyAsync") { (sourceURI: String, jpegQuality: Int) throws -> [String: Any] in
      return try self.applyBeautyEffect(sourceURI: sourceURI, jpegQuality: jpegQuality)
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

  private func applyPortraitEffect(
    sourceURI: String,
    jpegQuality: Int,
    focusX: Double,
    focusY: Double
  ) throws -> [String: Any] {
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

    guard let mask = try self.subjectMask(image: image, focusX: focusX, focusY: focusY) else {
      return ["uri": sourceURI, "applied": false]
    }
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

  private func subjectMask(image: CIImage, focusX: Double, focusY: Double) throws -> CIImage? {
    guard #available(iOS 17.0, *) else { return nil }
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(ciImage: image, orientation: .up)
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else { return nil }
    var instances = observation.allInstances
    let labels = observation.instanceMask
    CVPixelBufferLockBaseAddress(labels, .readOnly)
    if let base = CVPixelBufferGetBaseAddress(labels) {
      let width = CVPixelBufferGetWidth(labels)
      let height = CVPixelBufferGetHeight(labels)
      let x = min(width - 1, max(0, Int(focusX * Double(width))))
      let y = min(height - 1, max(0, Int(focusY * Double(height))))
      let label = Int(base.assumingMemoryBound(to: UInt8.self)[y * CVPixelBufferGetBytesPerRow(labels) + x])
      // Background taps retain all detected foreground, never a geometric shape.
      if label != 0 && instances.contains(label) { instances = IndexSet(integer: label) }
    }
    CVPixelBufferUnlockBaseAddress(labels, .readOnly)
    let buffer = try observation.generateScaledMaskForImage(forInstances: instances, from: handler)
    return CIImage(cvPixelBuffer: buffer)
      .clampedToExtent()
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.2])
      .cropped(to: image.extent)
  }

  private func applyBeautyEffect(sourceURI: String, jpegQuality: Int) throws -> [String: Any] {
    let sourceURL = try fileURL(sourceURI)
    guard var image = CIImage(
      contentsOf: sourceURL,
      options: [.applyOrientationProperty: true]
    ) else {
      throw NSError(domain: "PortraitEffect", code: 4, userInfo: [NSLocalizedDescriptionKey: "The captured photo could not be decoded."])
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

    let faceRequest = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(ciImage: image, orientation: .up)
    try handler.perform([faceRequest])
    guard let faces = faceRequest.results, !faces.isEmpty else {
      return ["uri": sourceURI, "applied": false]
    }

    guard let mask = beautyMask(for: faces, extent: image.extent) else {
      return ["uri": sourceURI, "applied": false]
    }
    let softened = image
      .applyingFilter("CINoiseReduction", parameters: [
        "inputNoiseLevel": 0.035,
        "inputSharpness": 0.58,
      ])
      .applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: 0.08])
    let beautyImage = softened.applyingFilter("CIBlendWithMask", parameters: [
      kCIInputBackgroundImageKey: image,
      kCIInputMaskImageKey: mask,
    ])

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let context = CIContext(options: [.cacheIntermediates: false])
    let quality = Double(min(max(jpegQuality, 80), 100)) / 100
    let qualityKey = CIImageRepresentationOption(
      rawValue: kCGImageDestinationLossyCompressionQuality as String
    )
    guard let data = context.jpegRepresentation(
      of: beautyImage,
      colorSpace: colorSpace,
      options: [qualityKey: quality]
    ) else {
      throw NSError(domain: "PortraitEffect", code: 5, userInfo: [NSLocalizedDescriptionKey: "The Beauty photo could not be encoded."])
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("intellicam-beauty-\(UUID().uuidString).jpg")
    try data.write(to: outputURL, options: .atomic)
    return ["uri": outputURL.absoluteString, "applied": true]
  }

  private func beautyMask(
    for faces: [VNFaceObservation],
    extent: CGRect
  ) -> CIImage? {
    var combinedMask: CIImage?

    for face in faces {
      let bounds = face.boundingBox
      var faceRect = CGRect(
        x: extent.minX + bounds.minX * extent.width,
        y: extent.minY + bounds.minY * extent.height,
        width: bounds.width * extent.width,
        height: bounds.height * extent.height
      )
      faceRect = faceRect.insetBy(
        dx: -faceRect.width * 0.08,
        dy: -faceRect.height * 0.12
      ).intersection(extent)
      guard !faceRect.isEmpty else { continue }

      guard let faceMask = CIFilter(
        name: "CIRoundedRectangleGenerator",
        parameters: [
          "inputExtent": CIVector(cgRect: faceRect),
          "inputRadius": min(faceRect.width, faceRect.height) * 0.4,
          "inputColor": CIColor(red: 1, green: 1, blue: 1, alpha: 1),
        ]
      )?.outputImage else { continue }
      let featherRadius = max(8, min(faceRect.width, faceRect.height) * 0.06)
      let featheredMask = faceMask
        .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: featherRadius])
        .cropped(to: extent)
      combinedMask = combinedMask.map {
        featheredMask.applyingFilter("CIMaximumCompositing", parameters: [
          kCIInputBackgroundImageKey: $0,
        ])
      } ?? featheredMask
    }

    return combinedMask?.applyingFilter("CIColorMatrix", parameters: [
      "inputRVector": CIVector(x: 0.3, y: 0, z: 0, w: 0),
      "inputGVector": CIVector(x: 0, y: 0.3, z: 0, w: 0),
      "inputBVector": CIVector(x: 0, y: 0, z: 0.3, w: 0),
      "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
    ])
  }
}
