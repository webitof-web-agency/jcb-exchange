type PushSubscriptionKeys = {
  auth: string;
  p256dh: string;
};

export type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isPushSubscriptionPayload = (
  value: unknown,
): value is PushSubscriptionPayload => {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.endpoint !== 'string' || value.endpoint.trim().length === 0) {
    return false;
  }

  if (!isRecord(value.keys)) {
    return false;
  }

  return (
    typeof value.keys.auth === 'string' &&
    value.keys.auth.trim().length > 0 &&
    typeof value.keys.p256dh === 'string' &&
    value.keys.p256dh.trim().length > 0
  );
};

export const normalizePushSubscription = (
  value: PushSubscriptionPayload,
): PushSubscriptionPayload => ({
  endpoint: value.endpoint.trim(),
  expirationTime:
    typeof value.expirationTime === 'number' ? value.expirationTime : null,
  keys: {
    auth: value.keys.auth.trim(),
    p256dh: value.keys.p256dh.trim(),
  },
});

export const isExpiredPushSubscriptionError = (error: unknown): boolean => {
  if (!isRecord(error)) {
    return false;
  }

  return error.statusCode === 404 || error.statusCode === 410;
};
