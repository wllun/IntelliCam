package expo.modules.photometadata

import android.content.Context
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class PhotoMetadataModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PhotoMetadata")

    AsyncFunction("writeMetadataAsync") Coroutine {
        sourceUri: String,
        targetUri: String,
        metadataJson: String,
        latitude: Double?,
        longitude: Double?,
        altitude: Double? ->
      val source = exifForReading(sourceUri)
      val targetPath = filePath(targetUri)
      val target = ExifInterface(targetPath)

      copyCameraMetadata(source, target)
      target.setAttribute(ExifInterface.TAG_USER_COMMENT, "$COMMENT_PREFIX$metadataJson")
      target.setAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION, "IntelliCam capture")
      target.setAttribute(ExifInterface.TAG_SOFTWARE, "IntelliCam")

      if (latitude != null && longitude != null) {
        target.setLatLong(latitude, longitude)
        altitude?.let(target::setAltitude)
      }

      target.saveAttributes()
    }

    AsyncFunction("readMetadataAsync") Coroutine { uri: String ->
      val exif = exifForReading(uri)
      val coordinates = exif.latLong
      val altitude = exif.getAltitude(Double.NaN).takeUnless(Double::isNaN)
      mapOf(
        "customMetadata" to exif.getAttribute(ExifInterface.TAG_USER_COMMENT)
          ?.removePrefix(COMMENT_PREFIX),
        "make" to exif.getAttribute(ExifInterface.TAG_MAKE),
        "model" to exif.getAttribute(ExifInterface.TAG_MODEL),
        "dateTimeOriginal" to exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL),
        "exposureTime" to exif.getAttribute(ExifInterface.TAG_EXPOSURE_TIME),
        "fNumber" to exif.getAttribute(ExifInterface.TAG_F_NUMBER),
        "iso" to exif.getAttribute(ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY),
        "focalLength" to exif.getAttribute(ExifInterface.TAG_FOCAL_LENGTH),
        "lensModel" to exif.getAttribute(ExifInterface.TAG_LENS_MODEL),
        "digitalZoomRatio" to exif.getAttribute(ExifInterface.TAG_DIGITAL_ZOOM_RATIO),
        "exposureBias" to exif.getAttribute(ExifInterface.TAG_EXPOSURE_BIAS_VALUE),
        "latitude" to coordinates?.getOrNull(0),
        "longitude" to coordinates?.getOrNull(1),
        "altitude" to altitude,
      )
    }
  }

  private fun exifForReading(uriString: String): ExifInterface {
    val uri = Uri.parse(uriString)
    if (uri.scheme == "content") {
      val stream = context.contentResolver.openInputStream(uri)
        ?: throw IllegalArgumentException("The selected photo could not be opened.")
      return stream.use(::ExifInterface)
    }
    return ExifInterface(filePath(uriString))
  }

  private fun filePath(uriString: String): String {
    val uri = Uri.parse(uriString)
    val path = if (uri.scheme == "file") uri.path else uriString
    require(!path.isNullOrBlank()) { "Invalid photo file URI." }
    require(File(path).exists()) { "The photo file does not exist." }
    return path
  }

  private fun copyCameraMetadata(source: ExifInterface, target: ExifInterface) {
    COPIED_TAGS.forEach { tag ->
      source.getAttribute(tag)?.let { target.setAttribute(tag, it) }
    }
  }

  companion object {
    private const val COMMENT_PREFIX = "IntelliCam:"
    private val COPIED_TAGS = listOf(
      ExifInterface.TAG_MAKE,
      ExifInterface.TAG_MODEL,
      ExifInterface.TAG_DATETIME,
      ExifInterface.TAG_DATETIME_ORIGINAL,
      ExifInterface.TAG_DATETIME_DIGITIZED,
      ExifInterface.TAG_OFFSET_TIME,
      ExifInterface.TAG_OFFSET_TIME_ORIGINAL,
      ExifInterface.TAG_OFFSET_TIME_DIGITIZED,
      ExifInterface.TAG_SUBSEC_TIME,
      ExifInterface.TAG_SUBSEC_TIME_ORIGINAL,
      ExifInterface.TAG_SUBSEC_TIME_DIGITIZED,
      ExifInterface.TAG_EXPOSURE_TIME,
      ExifInterface.TAG_F_NUMBER,
      ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY,
      ExifInterface.TAG_SENSITIVITY_TYPE,
      ExifInterface.TAG_EXPOSURE_PROGRAM,
      ExifInterface.TAG_EXPOSURE_MODE,
      ExifInterface.TAG_EXPOSURE_BIAS_VALUE,
      ExifInterface.TAG_METERING_MODE,
      ExifInterface.TAG_FLASH,
      ExifInterface.TAG_FOCAL_LENGTH,
      ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM,
      ExifInterface.TAG_LENS_MAKE,
      ExifInterface.TAG_LENS_MODEL,
      ExifInterface.TAG_WHITE_BALANCE,
      ExifInterface.TAG_SCENE_CAPTURE_TYPE,
    )
  }
}
