import { Directory, File, Paths } from 'expo-file-system';

import { preserveOriginalForRecovery } from '@/utils/capture-recovery-policy.mjs';

const RECOVERY_DIRECTORY_NAME = 'pending-captures';
const RECOVERY_FILE_PREFIX = 'intellicam-pending-';

export interface PendingCaptureRecovery {
  key: string;
  uri: string;
  createdAt: number;
}

function recoveryDirectory() {
  return new Directory(Paths.document, RECOVERY_DIRECTORY_NAME);
}

function ensureRecoveryDirectory() {
  const directory = recoveryDirectory();
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function normalizeSourceUri(uriOrPath: string) {
  return uriOrPath.startsWith('file://') ? uriOrPath : `file://${uriOrPath}`;
}

function isRecoveryUri(uri: string) {
  const directoryUri = recoveryDirectory().uri.replace(/\/$/, '');
  return uri.startsWith(`${directoryUri}/`);
}

export function retainCaptureForRecovery(
  sourceUriOrPath: string,
  captureId: number,
): PendingCaptureRecovery {
  const directory = ensureRecoveryDirectory();
  const createdAt = Date.now();
  const key = `${createdAt}-${captureId}`;
  const destination = new File(directory, `${RECOVERY_FILE_PREFIX}${key}.jpg`);
  const source = new File(normalizeSourceUri(sourceUriOrPath));
  preserveOriginalForRecovery(source, destination);
  return { key, uri: destination.uri, createdAt };
}

export function replaceRecoveryPhoto(
  sourceUriOrPath: string,
  recovery: PendingCaptureRecovery,
) {
  if (!isRecoveryUri(recovery.uri)) {
    throw new Error('Refusing to replace a file outside capture recovery storage.');
  }
  const source = new File(normalizeSourceUri(sourceUriOrPath));
  if (!source.exists) throw new Error('The processed photo is no longer available.');
  const directory = ensureRecoveryDirectory();
  const replacement = new File(directory, `${RECOVERY_FILE_PREFIX}${recovery.key}-processed.jpg`);
  if (replacement.exists) replacement.delete();
  source.copy(replacement);
  const previous = new File(recovery.uri);
  if (previous.exists) previous.delete();
  return { ...recovery, uri: replacement.uri };
}

export function listCaptureRecoveries(): PendingCaptureRecovery[] {
  const directory = recoveryDirectory();
  if (!directory.exists) return [];
  return directory.list()
    .filter((entry): entry is File => entry instanceof File
      && entry.name.startsWith(RECOVERY_FILE_PREFIX)
      && entry.extension.toLowerCase() === '.jpg'
      && entry.exists)
    .map((file) => {
      const name = file.name.slice(RECOVERY_FILE_PREFIX.length, -file.extension.length);
      const createdAt = Number(name.split('-')[0]);
      return {
        key: name,
        uri: file.uri,
        createdAt: Number.isFinite(createdAt) ? createdAt : file.modificationTime ?? 0,
      };
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function discardCaptureRecovery(recovery: PendingCaptureRecovery) {
  if (!isRecoveryUri(recovery.uri)) {
    throw new Error('Refusing to delete a file outside capture recovery storage.');
  }
  const file = new File(recovery.uri);
  if (file.exists) file.delete();
}

export function removeTemporaryCaptureFiles(urisOrPaths: string[], retainedUri?: string) {
  const retained = retainedUri ? normalizeSourceUri(retainedUri) : undefined;
  for (const uriOrPath of new Set(urisOrPaths.filter(Boolean))) {
    try {
      const uri = normalizeSourceUri(uriOrPath);
      if (uri === retained || isRecoveryUri(uri)) continue;
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // The camera or operating system may already have removed a temporary file.
    }
  }
}
