import { AlertTriangle, Check, Clock, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; to: string };
}

interface ToastApi {
  success: (message: string, action?: ToastItem['action']) => void;
  error: (message: string, action?: ToastItem['action']) => void;
  info: (message: string, action?: ToastItem['action']) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const style: Record<ToastKind, { cls: string; Icon: typeof Check }> = {
  success: { cls: 'bg-brand', Icon: Check },
  error: { cls: 'bg-red', Icon: AlertTriangle },
  info: { cls: 'bg-gray-800', Icon: Clock },
};

export function ToastView({ kind, message, action, onClose }: Omit<ToastItem, 'id'> & { onClose?: () => void }) {
  const { cls, Icon } = style[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex max-w-[480px] animate-toast-in items-center gap-3 rounded-[10px] px-5 py-3 text-md text-white shadow-3',
        cls,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      {action ? (
        <Link to={action.to} className="shrink-0 font-semibold underline underline-offset-2" onClick={onClose}>
          {action.label}
        </Link>
      ) : null}
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-80 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, message: string, action?: ToastItem['action']) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-3), { id, kind, message, action }]);
      setTimeout(() => remove(id), kind === 'error' ? 8000 : 5000);
    },
    [remove],
  );
  const api = useMemo<ToastApi>(
    () => ({
      success: (m, a) => push('success', m, a),
      error: (m, a) => push('error', m, a),
      info: (m, a) => push('info', m, a),
    }),
    [push],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2 sm:left-auto sm:right-6 sm:w-auto sm:translate-x-0 sm:items-end">
        {items.map((t) => (
          <ToastView key={t.id} kind={t.kind} message={t.message} action={t.action} onClose={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
