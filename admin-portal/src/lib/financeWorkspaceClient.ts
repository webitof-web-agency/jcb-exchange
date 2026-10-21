import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';

// Client helpers for the Financial Reports & CA Workspace (backend: /finance-hub/*).

export const SCHEMA_MISSING_CODE = 'FINANCE_HUB_SCHEMA_MISSING';

type ApiError = { response?: { status?: number; data?: { error?: string; code?: string; details?: unknown } } };

export const apiErrorMessage = (error: unknown, fallback: string) =>
  (error as ApiError)?.response?.data?.error || fallback;

export const apiErrorDetails = <T = unknown>(error: unknown) => (error as ApiError)?.response?.data?.details as T | undefined;

export const isSchemaMissingError = (error: unknown) => (error as ApiError)?.response?.data?.code === SCHEMA_MISSING_CODE;

export const isConflictError = (error: unknown) => (error as ApiError)?.response?.status === 409;

const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatInr = (value: number | null | undefined) => (value === null || value === undefined ? '—' : inrFormatter.format(value));

export const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : '—';

export const enumLabel = (value: string | null | undefined) =>
  value ? value.toLowerCase().split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '—';

/** Permission checks for workspace pages; super admins and admins pass every check, like the API. */
export const useFinanceWorkspaceAccess = () => {
  const user = useAuthStore((state) => state.user);
  return useMemo(() => {
    const fullAccess = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
    const permissions = user?.permissions || [];
    return {
      fullAccess,
      can: (required: string[]) => fullAccess || hasAnyPermission(permissions, required),
    };
  }, [user?.permissions, user?.role]);
};
