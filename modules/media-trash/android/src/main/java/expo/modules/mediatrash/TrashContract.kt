package expo.modules.mediatrash

import android.app.Activity
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult.Companion.ACTION_INTENT_SENDER_REQUEST
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult.Companion.EXTRA_INTENT_SENDER_REQUEST
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.providers.AppContextProvider
import java.io.Serializable

class TrashContract(
  private val appContextProvider: AppContextProvider
) : AppContextActivityResultContract<TrashContractInput, Boolean> {
  private val contentResolver: ContentResolver
    get() = appContextProvider.appContext.reactContext?.contentResolver
      ?: throw Exceptions.ReactContextLost()

  override fun createIntent(context: Context, input: TrashContractInput): Intent {
    val request = MediaStore.createTrashRequest(contentResolver, input.uris, true)
    val intentSenderRequest = IntentSenderRequest.Builder(request.intentSender).build()
    return Intent(ACTION_INTENT_SENDER_REQUEST)
      .putExtra(EXTRA_INTENT_SENDER_REQUEST, intentSenderRequest)
  }

  override fun parseResult(input: TrashContractInput, resultCode: Int, intent: Intent?): Boolean {
    return resultCode == Activity.RESULT_OK
  }
}

data class TrashContractInput(val uris: List<Uri>) : Serializable
