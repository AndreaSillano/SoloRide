import type { RidePreviewStatus } from './types';

export type RideErrorCode =
  | 'invalid_code'
  | 'upcoming'
  | 'expired'
  | 'archived'
  | 'duplicate'
  | 'not_found'
  | 'forbidden'
  | 'validation'
  | 'unknown';

const ERROR_MESSAGES: Record<RideErrorCode, string> = {
  invalid_code: 'That Ride code is invalid.',
  upcoming: 'This Ride has not started yet.',
  expired: 'This Ride has already ended.',
  archived: 'This Ride has been archived.',
  duplicate: 'You are already a member of this Ride.',
  not_found: 'We could not find that Ride.',
  forbidden: 'You do not have permission to do that.',
  validation: 'The Ride details are not valid.',
  unknown: 'We could not complete that Ride action. Please try again.',
};

export class RideProductError extends Error {
  constructor(
    public readonly code: RideErrorCode,
    message = ERROR_MESSAGES[code],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RideProductError';
  }
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === 'object' && error !== null) {
    const message = Reflect.get(error, 'message');
    const details = Reflect.get(error, 'details');
    return `${typeof message === 'string' ? message : ''} ${
      typeof details === 'string' ? details : ''
    }`.toLowerCase();
  }
  return '';
}

function databaseErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return null;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : null;
}

export function previewStatusError(status: Exclude<RidePreviewStatus, 'available'>) {
  const code: RideErrorCode = status === 'invalid' ? 'invalid_code' : status;
  return new RideProductError(code);
}

export function mapRideError(error: unknown): RideProductError {
  if (error instanceof RideProductError) return error;

  const text = errorText(error);
  const databaseCode = databaseErrorCode(error);

  if (text.includes('already') || text.includes('member') || databaseCode === '23505') {
    return new RideProductError('duplicate', undefined, { cause: error });
  }
  if (text.includes('not started') || text.includes('upcoming')) {
    return new RideProductError('upcoming', undefined, { cause: error });
  }
  if (text.includes('expired') || text.includes('already ended')) {
    return new RideProductError('expired', undefined, { cause: error });
  }
  if (text.includes('archived')) {
    return new RideProductError('archived', undefined, { cause: error });
  }
  if (text.includes('code') && (text.includes('invalid') || text.includes('not found'))) {
    return new RideProductError('invalid_code', undefined, { cause: error });
  }
  if (text.includes('not found') || databaseCode === 'P0002') {
    return new RideProductError('not_found', undefined, { cause: error });
  }
  if (text.includes('date') || text.includes('schedule') || databaseCode === '22023') {
    return new RideProductError('validation', undefined, { cause: error });
  }
  if (text.includes('permission') || text.includes('creator') || databaseCode === '42501') {
    return new RideProductError('forbidden', undefined, { cause: error });
  }
  return new RideProductError('unknown', undefined, { cause: error });
}
