import ExpoModulesCore
import ImageIO
import UniformTypeIdentifiers

public final class PhotoMetadataModule: Module {
  private let commentPrefix = "IntelliCam:"

  public func definition() -> ModuleDefinition {
    Name("PhotoMetadata")

    AsyncFunction("writeMetadataAsync") { (
      sourceURI: String,
      targetURI: String,
      metadataJSON: String,
      latitude: Double?,
      longitude: Double?,
      altitude: Double?
    ) throws in
      try self.writeMetadata(
        sourceURI: sourceURI,
        targetURI: targetURI,
        metadataJSON: metadataJSON,
        latitude: latitude,
        longitude: longitude,
        altitude: altitude
      )
    }

    AsyncFunction("readMetadataAsync") { (uri: String) throws -> [String: Any?] in
      return try self.readMetadata(uri: uri)
    }
  }

  private func fileURL(_ value: String) throws -> URL {
    if let url = URL(string: value), url.isFileURL {
      return url
    }
    let url = URL(fileURLWithPath: value)
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw NSError(domain: "PhotoMetadata", code: 1, userInfo: [NSLocalizedDescriptionKey: "The photo file does not exist."])
    }
    return url
  }

  private func properties(at url: URL) -> [String: Any] {
    guard
      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any]
    else { return [:] }
    return properties
  }

  private func writeMetadata(
    sourceURI: String,
    targetURI: String,
    metadataJSON: String,
    latitude: Double?,
    longitude: Double?,
    altitude: Double?
  ) throws {
    let sourceURL = try fileURL(sourceURI)
    let targetURL = try fileURL(targetURI)
    guard let imageSource = CGImageSourceCreateWithURL(targetURL as CFURL, nil) else {
      throw NSError(domain: "PhotoMetadata", code: 2, userInfo: [NSLocalizedDescriptionKey: "The processed JPEG could not be opened."])
    }

    var metadata = properties(at: sourceURL)
    let targetProperties = properties(at: targetURL)
    metadata[kCGImagePropertyPixelWidth as String] = targetProperties[kCGImagePropertyPixelWidth as String]
    metadata[kCGImagePropertyPixelHeight as String] = targetProperties[kCGImagePropertyPixelHeight as String]
    metadata[kCGImagePropertyOrientation as String] = targetProperties[kCGImagePropertyOrientation as String] ?? 1

    var exif = metadata[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
    exif[kCGImagePropertyExifUserComment as String] = commentPrefix + metadataJSON
    metadata[kCGImagePropertyExifDictionary as String] = exif

    var tiff = metadata[kCGImagePropertyTIFFDictionary as String] as? [String: Any] ?? [:]
    tiff[kCGImagePropertyTIFFImageDescription as String] = "IntelliCam capture"
    tiff[kCGImagePropertyTIFFSoftware as String] = "IntelliCam"
    metadata[kCGImagePropertyTIFFDictionary as String] = tiff

    if let latitude, let longitude {
      var gps = metadata[kCGImagePropertyGPSDictionary as String] as? [String: Any] ?? [:]
      gps[kCGImagePropertyGPSLatitude as String] = abs(latitude)
      gps[kCGImagePropertyGPSLatitudeRef as String] = latitude >= 0 ? "N" : "S"
      gps[kCGImagePropertyGPSLongitude as String] = abs(longitude)
      gps[kCGImagePropertyGPSLongitudeRef as String] = longitude >= 0 ? "E" : "W"
      if let altitude {
        gps[kCGImagePropertyGPSAltitude as String] = abs(altitude)
        gps[kCGImagePropertyGPSAltitudeRef as String] = altitude >= 0 ? 0 : 1
      }
      metadata[kCGImagePropertyGPSDictionary as String] = gps
    }

    let temporaryURL = targetURL.deletingLastPathComponent()
      .appendingPathComponent(".intellicam-\(UUID().uuidString).jpg")
    guard
      let type = CGImageSourceGetType(imageSource),
      let destination = CGImageDestinationCreateWithURL(temporaryURL as CFURL, type, 1, nil)
    else {
      throw NSError(domain: "PhotoMetadata", code: 3, userInfo: [NSLocalizedDescriptionKey: "The metadata writer could not be created."])
    }

    CGImageDestinationAddImageFromSource(destination, imageSource, 0, metadata as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
      try? FileManager.default.removeItem(at: temporaryURL)
      throw NSError(domain: "PhotoMetadata", code: 4, userInfo: [NSLocalizedDescriptionKey: "The photo metadata could not be saved."])
    }

    do {
      _ = try FileManager.default.replaceItemAt(targetURL, withItemAt: temporaryURL)
    } catch {
      try? FileManager.default.removeItem(at: temporaryURL)
      throw error
    }
  }

  private func readMetadata(uri: String) throws -> [String: Any?] {
    let metadata = properties(at: try fileURL(uri))
    let exif = metadata[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
    let tiff = metadata[kCGImagePropertyTIFFDictionary as String] as? [String: Any] ?? [:]
    let gps = metadata[kCGImagePropertyGPSDictionary as String] as? [String: Any] ?? [:]
    let latitudeValue = gps[kCGImagePropertyGPSLatitude as String] as? Double
    let longitudeValue = gps[kCGImagePropertyGPSLongitude as String] as? Double
    let latitude = latitudeValue.map { (gps[kCGImagePropertyGPSLatitudeRef as String] as? String) == "S" ? -$0 : $0 }
    let longitude = longitudeValue.map { (gps[kCGImagePropertyGPSLongitudeRef as String] as? String) == "W" ? -$0 : $0 }
    let altitudeValue = gps[kCGImagePropertyGPSAltitude as String] as? Double
    let altitude = altitudeValue.map { (gps[kCGImagePropertyGPSAltitudeRef as String] as? Int) == 1 ? -$0 : $0 }
    let comment = exif[kCGImagePropertyExifUserComment as String] as? String

    return [
      "customMetadata": comment?.hasPrefix(commentPrefix) == true ? String(comment!.dropFirst(commentPrefix.count)) : nil,
      "make": tiff[kCGImagePropertyTIFFMake as String],
      "model": tiff[kCGImagePropertyTIFFModel as String],
      "dateTimeOriginal": exif[kCGImagePropertyExifDateTimeOriginal as String],
      "exposureTime": exif[kCGImagePropertyExifExposureTime as String],
      "fNumber": exif[kCGImagePropertyExifFNumber as String],
      "iso": exif[kCGImagePropertyExifISOSpeedRatings as String],
      "focalLength": exif[kCGImagePropertyExifFocalLength as String],
      "lensModel": exif[kCGImagePropertyExifLensModel as String],
      "digitalZoomRatio": exif[kCGImagePropertyExifDigitalZoomRatio as String],
      "exposureBias": exif[kCGImagePropertyExifExposureBiasValue as String],
      "latitude": latitude,
      "longitude": longitude,
      "altitude": altitude,
    ]
  }
}
