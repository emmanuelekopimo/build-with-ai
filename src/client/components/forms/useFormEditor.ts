import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { strictSchema, type NewFormType } from '../../../shared/formSchemas';
import { api, ApiError, newIdempotencyKey } from '../../lib/api';
import { queryClient } from '../../lib/query';
import { useToast } from '../ui/Toast';

export interface Saved {
  id: string;
  reference: string;
  status: string;
  emailWarning?: string | null;
}

function zodFields(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join('.');
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Shared draft/save/send logic for Issuance, Return and Movement editors. */
export function useFormEditor(type: NewFormType, initial: { id: string; reference: string } | null, returnTo: string) {
  const toast = useToast();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | 'save' | 'send'>(null);
  const keyRef = useRef<string>(newIdempotencyKey());

  const focusFirst = (fields: Record<string, string>) => {
    const first = Object.keys(fields)[0];
    if (!first) return;
    const id = `f-${first.replace(/\./g, '-')}`;
    const el = document.getElementById(id) ?? document.querySelector<HTMLElement>(`[data-field="${first.split('.')[0]}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el : el?.querySelector<HTMLElement>('input,select,button'))?.focus({ preventScroll: true });
  };

  const showErrors = useCallback(
    (fields: Record<string, string>, fallback?: string) => {
      setErrors(fields);
      const n = Object.keys(fields).length;
      toast.error(n ? `${n} field${n === 1 ? '' : 's'} need attention: ${Object.values(fields)[0]}` : (fallback ?? 'Check the form.'));
      setTimeout(() => focusFirst(fields), 50);
    },
    [toast],
  );

  /** Client-side strict validation (same schema as the server). */
  const validate = useCallback(
    (data: unknown, tags: string[]): boolean => {
      const fields: Record<string, string> = {};
      if (tags.length === 0) fields.assetTags = 'Add at least one asset.';
      const r = strictSchema(type).safeParse(data);
      if (!r.success) Object.assign(fields, zodFields(r.error));
      if (Object.keys(fields).length) {
        showErrors(fields);
        return false;
      }
      setErrors({});
      return true;
    },
    [type, showErrors],
  );

  const save = useCallback(
    async (data: unknown, tags: string[], opts: { quiet?: boolean } = {}): Promise<Saved | null> => {
      setBusy('save');
      try {
        const body = { type, assetTags: tags, data, send: false };
        const r = saved
          ? await api<Saved>(`/forms/${saved.id}`, { method: 'PATCH', body })
          : await api<Saved>('/forms', { body, idempotencyKey: keyRef.current });
        if (!saved) {
          setSaved({ id: r.id, reference: r.reference });
          keyRef.current = newIdempotencyKey();
          // Keep the editor mounted; just point the address bar at the draft so a reload resumes it.
          window.history.replaceState(window.history.state, '', `/forms/${r.id}/edit?from=${encodeURIComponent(returnTo)}`);
        }
        if (!opts.quiet) toast.success(`Draft ${r.reference} saved`, { label: 'Resume later from Sign-offs', to: '/signoffs?tab=DRAFT' });
        void queryClient.invalidateQueries({ queryKey: ['signoffs'] });
        return r;
      } catch (e) {
        if (e instanceof ApiError && Object.keys(e.fields).length) showErrors(e.fields);
        else toast.error(e instanceof ApiError ? e.message : 'Could not save the draft.');
        return null;
      } finally {
        setBusy(null);
      }
    },
    [type, saved, returnTo, toast, showErrors],
  );

  const send = useCallback(
    async (data: unknown, tags: string[], label: string, highlight: string): Promise<boolean> => {
      setBusy('send');
      try {
        const body = { type, assetTags: tags, data, send: false };
        let id = saved?.id;
        if (id) await api(`/forms/${id}`, { method: 'PATCH', body });
        else {
          const r = await api<Saved>('/forms', { body, idempotencyKey: keyRef.current });
          id = r.id;
          setSaved({ id: r.id, reference: r.reference });
        }
        const r = await api<Saved>(`/forms/${id}/send`, { body: {} });
        for (const k of ['signoffs', 'assets', 'asset', 'nav-counts', 'registry', 'dashboard']) void queryClient.invalidateQueries({ queryKey: [k] });
        toast.success(`${r.reference} ${label}`, { label: `View ${r.reference}`, to: `/signoffs?ref=${r.reference}` });
        if (r.emailWarning) toast.error(r.emailWarning);
        const sep = returnTo.includes('?') ? '&' : '?';
        navigate(`${returnTo}${returnTo.startsWith('/forms') ? `${sep}highlight=${highlight}` : ''}`);
        return true;
      } catch (e) {
        if (e instanceof ApiError && Object.keys(e.fields).length) showErrors(e.fields);
        else toast.error(e instanceof ApiError ? e.message : 'Could not send the form.');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [type, saved, navigate, returnTo, toast, showErrors],
  );

  return { saved, errors, setErrors, busy, validate, save, send, showErrors };
}
