import { secureRandomUuidOrNull } from '../utils/random-uuid';

export type LessonAuthorVideoUploadPhase = 'preparing' | 'uploading' | 'accepting';

type SecureRandomSource = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>;

export class LessonAuthorUploadPreparationError extends Error {
  readonly code = 'VIDEO_UPLOAD_SECURE_RANDOM_UNAVAILABLE';

  constructor() {
    super('Secure browser randomness is unavailable for this upload attempt.');
    this.name = 'LessonAuthorUploadPreparationError';
  }
}

/**
 * Create one UUIDv4 used for both safe request correlation and idempotency.
 * `crypto.randomUUID` is unavailable in some non-secure browser contexts;
 * `getRandomValues` is the cryptographic fallback. We never use timestamps or
 * Math.random because a duplicate key could alias two paid transcription jobs.
 */
export function createLessonAuthorUploadAttemptId(
  secureRandom: SecureRandomSource | null | undefined = globalThis.crypto,
): string {
  const id = secureRandomUuidOrNull(secureRandom);
  if (id === null) throw new LessonAuthorUploadPreparationError();
  return id;
}

export function lessonAuthorUploadSafeErrorCode(error: unknown): string {
  if (error instanceof LessonAuthorUploadPreparationError) return error.code;
  const status = Number((error as { response?: { status?: unknown } })?.response?.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return `HTTP_${status}`;
  const code = String((error as { code?: unknown })?.code || '').toUpperCase();
  if (['ECONNABORTED', 'ERR_NETWORK', 'ERR_CANCELED'].includes(code)) return code;
  return 'VIDEO_UPLOAD_UNKNOWN_ERROR';
}

/** Browser byte progress is optional; proxies/adapters may not expose total. */
export function normalizeLessonAuthorVideoUploadProgress(
  loaded: number | undefined,
  total: number | undefined,
): number | null {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || Number(total) <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((Number(loaded) / Number(total)) * 100)));
}

export function lessonAuthorVideoUploadPhase(progress: number | null): LessonAuthorVideoUploadPhase {
  if (progress === null) return 'uploading';
  return progress >= 100 ? 'accepting' : 'uploading';
}

export function shouldPollLessonAuthorTranscript(
  transcriptionStatus: unknown,
  kbDocumentStatus: unknown,
  sourceReady: unknown,
): boolean {
  return transcriptionStatus === 'queued'
    || transcriptionStatus === 'running'
    || (
      transcriptionStatus === 'committed'
      && sourceReady !== true
      && kbDocumentStatus !== 'error'
    );
}
