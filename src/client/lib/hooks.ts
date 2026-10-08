import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBeforeUnload, useBlocker, useSearchParams } from 'react-router-dom';
import { api } from './api';

export interface Category {
  id: string;
  name: string;
  group: string;
  icon: string;
  requiresSerial: boolean;
  description: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
}
export interface Location {
  id: string;
  name: string;
  isStore: boolean;
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => api<{ categories: Category[]; projects: Project[]; locations: Location[] }>('/meta'),
    staleTime: 5 * 60000,
  });
}

/** Typed access to URL search params (filters, tab and page live in the URL). */
export function useUrlState<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = useMemo(() => {
    const v = {} as Record<K, string>;
    for (const k of keys) v[k] = params.get(k) ?? '';
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const set = useCallback(
    (patch: Partial<Record<K, string | null>>, opts: { resetPage?: boolean; replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch) as Array<[string, string | null | undefined]>) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          if (opts.resetPage !== false && !('page' in patch)) next.delete('page');
          next.delete('highlight');
          return next;
        },
        { replace: opts.replace ?? false },
      );
    },
    [setParams],
  );
  return [values, set, params] as const;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Prompt before leaving a page with unsaved work (router navigation + tab close). */
export function useUnsavedChangesPrompt(dirty: boolean, message = 'You have unsaved changes. Leave this page?') {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(message)) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, message]);
  useBeforeUnload(
    useCallback(
      (e: BeforeUnloadEvent) => {
        if (dirty) {
          e.preventDefault();
          e.returnValue = message;
        }
      },
      [dirty, message],
    ),
  );
}

export function useInterval(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}
