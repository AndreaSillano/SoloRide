export type PostDataErrorCode =
  | 'AUTH_REQUIRED'
  | 'DUPLICATE_POST'
  | 'TEMPORARY_LIMIT'
  | 'INVALID_INPUT'
  | 'NETWORK'
  | 'IMAGE_PROCESSING'
  | 'UPLOAD'
  | 'STORAGE'
  | 'NOT_FOUND'
  | 'DATABASE';

export class PostDataError extends Error {
  constructor(
    public readonly code: PostDataErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PostDataError';
  }
}

type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

function errorLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? error : {};
}

export function isNetworkError(error: unknown) {
  const message = String(errorLike(error).message ?? error).toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('offline')
  );
}

export function mapDatabaseError(error: unknown, fallback: string): PostDataError {
  if (error instanceof PostDataError) return error;
  if (isNetworkError(error)) {
    return new PostDataError(
      'NETWORK',
      'You appear to be offline. Reconnect and try again.',
      { cause: error },
    );
  }

  const details = errorLike(error);
  const message = String(details.message ?? '');
  if (details.code === '23505') {
    return new PostDataError(
      'DUPLICATE_POST',
      'You already posted for this scheduled day.',
      { cause: error },
    );
  }
  if (
    details.code === 'P0001' ||
    message.toLowerCase().includes('temporary photo limit')
  ) {
    return new PostDataError(
      'TEMPORARY_LIMIT',
      'You already have 3 temporary photos active on this Ride.',
      { cause: error },
    );
  }
  if (details.code === 'PGRST116') {
    return new PostDataError('NOT_FOUND', 'That post no longer exists.', {
      cause: error,
    });
  }
  if (
    message.toLowerCase().includes('permission denied') &&
    (message.toLowerCase().includes('is_temporary') ||
      message.toLowerCase().includes('expires_at'))
  ) {
    return new PostDataError(
      'DATABASE',
      'Temporary posts need a database update. Apply the latest SoloRide migrations and try again.',
      { cause: error },
    );
  }
  return new PostDataError('DATABASE', fallback, { cause: error });
}

export function mapUploadError(error: unknown): PostDataError {
  if (isNetworkError(error)) {
    return new PostDataError(
      'NETWORK',
      'The image could not upload while offline. Reconnect and try again.',
      { cause: error },
    );
  }
  return new PostDataError('UPLOAD', 'The image upload failed. Please try again.', {
    cause: error,
  });
}
