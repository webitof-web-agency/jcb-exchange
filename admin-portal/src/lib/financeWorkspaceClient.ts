import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { financeModulePath, financePortalPrefix } from '@/lib/financeWorkspace';

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

/** Link builder for another workspace module's page, in the current portal (/admin or /employee). */
export const useFinanceHref = () => {
  const prefix = financePortalPrefix(usePathname());
  return useCallback((moduleKey: string, params?: Record<string, string | undefined>) => financeModulePath(prefix, moduleKey, params), [prefix]);
};

/**
 * `?new=<TYPE>` deep link (dashboard quick actions): returns the requested type once if it is in
 * `allowed`, then drops the param from the URL so a reload does not reopen the form.
 */
export const useRequestedNew = <T extends string>(allowed: readonly T[]) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get('new');
  const [value] = useState(() => (requested && (allowed as readonly string[]).includes(requested) ? (requested as T) : null));
  useEffect(() => {
    if (!requested) return;
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('new');
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [pathname, requested, router, searchParams]);
  return value;
};

/**
 * Register filters kept in the URL (?from=&to=&status=&q=&page=) so back/forward, reload and shared
 * links keep the view. Only keys in `defaults` are managed; values equal to the default are omitted.
 */
export const useUrlFilters = <T extends Record<string, string>>(defaults: T) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initialDefaults] = useState(defaults);
  const [state, setState] = useState<T>(() => {
    const next = { ...initialDefaults };
    (Object.keys(initialDefaults) as Array<keyof T>).forEach((key) => {
      const value = searchParams.get(String(key));
      if (value !== null) next[key] = value as T[keyof T];
    });
    return next;
  });
  const update = useCallback((next: T) => {
    setState(next);
    const params = new URLSearchParams(window.location.search);
    (Object.keys(initialDefaults) as Array<keyof T>).forEach((key) => {
      if (next[key] && next[key] !== initialDefaults[key]) params.set(String(key), next[key]);
      else params.delete(String(key));
    });
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  }, [initialDefaults, pathname, router]);
  return [state, update] as const;
};
