'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage, isSchemaMissingError } from '@/lib/financeWorkspaceClient';

type ResourceState<T> = {
  data: T | undefined;
  loading: boolean;
  error: string;
  schemaMissing: boolean;
};

/** Loads a workspace resource; `reload()` refetches. State only changes in async callbacks. */
export function useResource<T>(loader: () => Promise<T>, key: string) {
  const [state, setState] = useState<ResourceState<T>>({ data: undefined, loading: true, error: '', schemaMissing: false });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: '', schemaMissing: false }); })
      .catch((error) => {
        if (!cancelled) {
          setState((previous) => ({ ...previous, loading: false, error: apiErrorMessage(error, 'Could not load this section.'), schemaMissing: isSchemaMissingError(error) }));
        }
      });
    return () => { cancelled = true; };
    // `key` captures everything the loader depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}
