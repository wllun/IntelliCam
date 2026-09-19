/**
 * Transfers a camera-owned temporary file into durable recovery storage.
 * Moving is attempted first because it normally renames within app storage and
 * does not require enough free space for a second full JPEG.
 */
export function preserveOriginalForRecovery(source, destination) {
  if (!source.exists) throw new Error('The captured photo is no longer available.');
  if (destination.exists) destination.delete();

  try {
    source.move(destination);
    return 'moved';
  } catch (moveError) {
    // Some providers cannot move across locations. If the move actually
    // completed before reporting an error, the durable destination owns it.
    if (!source.exists && destination.exists) return 'moved';

    // Remove a partial destination before the copy fallback. The source is
    // deliberately never deleted by this path.
    if (destination.exists) destination.delete();
    try {
      source.copy(destination);
      return 'copied';
    } catch (copyError) {
      const error = new Error('Could not retain the captured photo in durable storage.');
      error.cause = { moveError, copyError };
      throw error;
    }
  }
}
