'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

// Live duplicate check for the listing form: asks the API whether this vehicle or chassis number already
// has a listing on JCB Exchange. The server checks again on save, so a failed lookup only hides the hint.

export type VehicleIdentityState = 'EMPTY' | 'UNIQUE' | 'ALREADY_LISTED' | 'OWN_DRAFT';

export type VehicleIdentityFieldCheck = {
  state: VehicleIdentityState;
  message: string | null;
  /** Only present when the clashing listing belongs to the signed-in seller. */
  listingId?: string;
  listingStatus?: string;
};

export type VehicleIdentityCheckResult = {
  blocked: boolean;
  registration: VehicleIdentityFieldCheck;
  chassis: VehicleIdentityFieldCheck;
};

const MIN_KEY_LENGTH = 5;

const toKey = (value: string | null | undefined) => {
  const key = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key.length >= MIN_KEY_LENGTH ? key : '';
};

export function useVehicleIdentityCheck({
  registrationNumber,
  chassisNumber,
  listingId,
  savedRegistrationNumber,
  savedChassisNumber,
  enabled = true,
  delayMs = 500,
}: {
  registrationNumber: string;
  chassisNumber: string;
  /** The listing being edited, which is left out of the search. */
  listingId?: string | null;
  /** Numbers the edited listing was saved with. The server lets those through unchanged, so they never block saving. */
  savedRegistrationNumber?: string | null;
  savedChassisNumber?: string | null;
  enabled?: boolean;
  delayMs?: number;
}) {
  const registrationKey = enabled ? toKey(registrationNumber) : '';
  const chassisKey = enabled ? toKey(chassisNumber) : '';
  const requestKey = registrationKey || chassisKey ? `${registrationKey}|${chassisKey}|${listingId || ''}` : '';
  const [response, setResponse] = useState<{ requestKey: string; result: VehicleIdentityCheckResult | null } | null>(null);

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get<VehicleIdentityCheckResult>('/listings/vehicle-identity-check', {
          params: {
            registrationNumber: registrationKey || undefined,
            chassisNumber: chassisKey || undefined,
            listingId: listingId || undefined,
          },
        });
        if (!cancelled) setResponse({ requestKey, result: data });
      } catch {
        if (!cancelled) setResponse({ requestKey, result: null });
      }
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [requestKey, registrationKey, chassisKey, listingId, delayMs]);

  // A result for numbers the seller has since changed is never shown.
  const result = response && response.requestKey === requestKey ? response.result : null;
  const keepsSavedNumbers = Boolean(listingId)
    && registrationKey === toKey(savedRegistrationNumber)
    && chassisKey === toKey(savedChassisNumber);
  return {
    result,
    isChecking: Boolean(requestKey) && response?.requestKey !== requestKey,
    blocked: Boolean(result?.blocked) && !keepsSavedNumbers,
    registrationReady: Boolean(registrationKey),
    chassisReady: Boolean(chassisKey),
  };
}
