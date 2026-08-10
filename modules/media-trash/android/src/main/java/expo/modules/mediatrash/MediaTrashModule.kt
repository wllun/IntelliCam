package expo.modules.mediatrash

import android.content.ContentUris
import android.content.Context
import android.os.Build
import android.provider.MediaStore
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MediaTrashModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private lateinit var trashLauncher: AppContextActivityResultLauncher<TrashContractInput, Boolean>

  override fun definition() = ModuleDefinition {
    Name("MediaTrash")

    Constant("isSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    }

    AsyncFunction("trashAssetAsync") Coroutine { assetId: String ->
      check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        "The Android recycle bin requires Android 11 or newer."
      }

      val numericId = assetId.toLongOrNull()
        ?: throw IllegalArgumentException("Invalid MediaStore asset id: $assetId")
      val assetUri = ContentUris.withAppendedId(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        numericId
      )
      val exists = context.contentResolver.query(
        assetUri,
        arrayOf(MediaStore.Images.Media._ID),
        null,
        null,
        null
      )?.use { cursor -> cursor.moveToFirst() } ?: false

      check(exists) { "The selected photo no longer exists in the media library." }
      return@Coroutine trashLauncher.launch(TrashContractInput(listOf(assetUri)))
    }

    RegisterActivityContracts {
      trashLauncher = registerForActivityResult(TrashContract(this@MediaTrashModule))
    }
  }
}
