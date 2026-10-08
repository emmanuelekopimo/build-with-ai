import { useQuery } from '@tanstack/react-query';
import { Box, CircleCheck, FileText, LayoutGrid, LogOut, PenLine, Send, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ROLE_CHIP, ROLE_LABEL } from '../../../shared/constants';
import type { Permission } from '../../../shared/permissions';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/Layout';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm: Permission;
  badge?: 'signoffs';
  end?: boolean;
}

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Operations',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutGrid, perm: 'dashboard.view', end: true },
      { to: '/assets', label: 'Asset Registry', icon: Box, perm: 'asset.view' },
      { to: '/intake', label: 'Intake (Form 1)', icon: CircleCheck, perm: 'intake.manage' },
    ],
  },
  {
    title: 'Signatures',
    items: [
      { to: '/forms', label: 'Issuance & Returns', icon: Send, perm: 'form.manage' },
      { to: '/signoffs', label: 'Sign-offs', icon: PenLine, perm: 'signoff.view', badge: 'signoffs' },
    ],
  },
  { title: 'Data', items: [{ to: '/reports', label: 'Reports & Exports', icon: FileText, perm: 'report.view' }] },
];

export function useNavCounts(enabled: boolean) {
  return useQuery({
    queryKey: ['nav-counts'],
    queryFn: () => api<{ signoffsAwaiting: number; unreadNotifications: number }>('/nav-counts'),
    enabled,
    refetchInterval: 60000,
  });
}

export function Sidebar({ onNavigate, onSignOut }: { onNavigate?: () => void; onSignOut: () => void }) {
  const { user, can } = useAuth();
  const counts = useNavCounts(Boolean(user) && can('signoff.view'));
  if (!user) return null;
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b-2 border-gray-100 px-6 pb-6 pt-6">
        <img src="/logo.png" alt="ECEWS-ITAMS — IT Asset Management System" width={205} height={59} className="h-auto w-[190px]" />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-4 pt-5">
        {SECTIONS.map((section) => {
          const items = section.items.filter((i) => can(i.perm));
          if (items.length === 0) return null;
          return (
            <div key={section.title} className="mb-4">
              <div className="mb-2 px-3 text-2xs font-semibold uppercase tracking-[0.08em] text-gray-500">{section.title}</div>
              <ul className="space-y-1">
                {items.map((item) => {
                  const badge = item.badge === 'signoffs' ? counts.data?.signoffsAwaiting : undefined;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          cn(
                            'flex h-10 items-center gap-3 rounded-md px-3.5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            isActive ? 'bg-green-nav font-semibold text-brand' : 'text-gray-800 hover:bg-gray-50',
                          )
                        }
                      >
                        <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        {badge ? (
                          <span
                            className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-2xs font-bold text-white"
                            aria-label={`${badge} awaiting`}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t-2 border-gray-100 px-5 py-5">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-gray-900">{user.name}</div>
            <div className="truncate text-sm text-gray-500">
              {ROLE_LABEL[user.role]} · {user.office}
            </div>
          </div>
          <span className="rounded-pill bg-green-100 px-2 py-0.5 text-2xs font-semibold text-brand">{ROLE_CHIP[user.role]}</span>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 inline-flex items-center gap-2 rounded-sm px-1 py-1 text-md font-medium text-red hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}
