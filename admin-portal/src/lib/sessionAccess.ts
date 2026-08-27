export const ACCOUNT_REVOKED_CODE = 'ACCOUNT_REVOKED';
export const ACCOUNT_INACTIVE_CODE = 'ACCOUNT_INACTIVE';

const getErrorResponse = (error: unknown) =>
  (error as { response?: { status?: number; data?: { code?: string; error?: string } } } | null)?.response;

export const isRevokedAccessError = (error: unknown) => {
  const response = getErrorResponse(error);
  if (!response) {
    return false;
  }

  if (response.status !== 403) {
    return false;
  }

  return response.data?.code === ACCOUNT_REVOKED_CODE || response.data?.error?.toLowerCase()?.includes('deactivated') || false;
};

export const isInactiveAccessError = (error: unknown) => {
  const response = getErrorResponse(error);
  if (!response) {
    return false;
  }

  if (response.status !== 403) {
    return false;
  }

  return response.data?.code === ACCOUNT_INACTIVE_CODE || response.data?.error?.toLowerCase()?.includes('inactive') || false;
};
