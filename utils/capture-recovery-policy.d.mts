export interface RecoveryFileHandle {
  readonly exists: boolean;
  move(destination: RecoveryFileHandle): void;
  copy(destination: RecoveryFileHandle): void;
  delete(): void;
}

export function preserveOriginalForRecovery(
  source: RecoveryFileHandle,
  destination: RecoveryFileHandle,
): 'moved' | 'copied';
