export type PostDataErrorCode =
  | 'AUTH_REQUIRED'
  | 'DUPLICATE_POST'
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
  if (details.code === '23505') {
    return new PostDataError(
      'DUPLICATE_POST',
      'You already posted for this scheduled day.',
      { cause: error },
    );
  }
  if (details.code === 'PGRST116') {
    return new PostDataError('NOT_FOUND', 'That post no longer exists.', {
      cause: error,
    });
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
