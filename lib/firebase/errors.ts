/** Detect Firebase / Firestore quota-exhaustion errors. */
export function isFirebaseQuotaError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.message} ${(error as { code?: string }).code ?? ''}`
      : String(error);
  return /RESOURCE_EXHAUSTED|Quota exceeded|quota exceeded/i.test(msg);
}

export function firebaseQuotaMessage(): string {
  return (
    'Firebase database quota exceeded. Employee data cannot be loaded right now. ' +
    'Wait for the daily quota reset or upgrade your Firebase plan in the Firebase Console.'
  );
}

export function wrapFirebaseError(error: unknown): Error {
  if (isFirebaseQuotaError(error)) return new Error(firebaseQuotaMessage());
  return error instanceof Error ? error : new Error(String(error));
}
