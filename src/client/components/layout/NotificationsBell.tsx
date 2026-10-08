import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fmtRelative } from '../../../shared/format';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { queryClient } from '../../lib/query';

interface Notification {
  id: string;
  kind: string;
  message: Array<{ t?: string; b?: string }>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const DOT: Record<string, string> = {
  OVERDUE_RETURN: 'bg-red',
  EXPIRED: 'bg-red',
  REJECTED: 'bg-red',
  DAMAGE: 'bg-red',
  LINK_EXPIRING: 'bg-amber',
  APPROVED: 'bg-blue',
  SIGNED: 'bg-brand',
  INFO: 'bg-gray-500',
};

/** Header bell with unread count and the notifications panel (Background+Border+Shadow). */
export function NotificationsBell() {
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ items: Notification[]; unread: number }>('/notifications'), refetchInterval: 60000 });
  const unread = q.data?.unread ?? 0;
  const markAll = async () => {
    await api('/notifications/read-all', { body: {} });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['nav-counts'] });
  };
  const markOne = async (n: Notification) => {
    if (n.readAt) return;
    await api(`/notifications/${n.id}/read`, { body: {} }).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-gray-200 bg-white text-gray-700 shadow-1 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unread ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-2xs font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[358px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[14px] border-2 border-gray-200 bg-white shadow-3">
          <div className="flex items-center justify-between border-b-2 border-gray-100 px-4 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
            {unread ? (
              <button type="button" onClick={() => void markAll()} className="text-sm font-semibold text-brand hover:underline">
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {q.data?.items.length === 0 ? <li className="px-4 py-8 text-center text-md text-gray-500">You’re all caught up.</li> : null}
            {q.data?.items.map((n) => {
              const body = (
                <div className="flex gap-3">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[n.kind] ?? 'bg-gray-400', n.readAt && 'opacity-40')} aria-hidden />
                  <div className={cn('min-w-0 text-md leading-[1.45] text-gray-700', n.readAt && 'text-gray-500')}>
                    {n.message.map((m, i) => (m.b ? <b key={i} className="font-semibold text-gray-900">{m.b}</b> : <span key={i}>{m.t}</span>))}
                    <div className="mt-0.5 text-xs text-gray-400">{fmtRelative(n.createdAt)}</div>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="border-b-2 border-gray-100 last:border-b-0">
                  {n.link ? (
                    <Popover.Close asChild>
                      <Link to={n.link} onClick={() => void markOne(n)} className="block px-4 py-3 hover:bg-gray-50">
                        {body}
                      </Link>
                    </Popover.Close>
                  ) : (
                    <div className="px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
