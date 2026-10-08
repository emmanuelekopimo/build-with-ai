import { Info, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_CHIP, ROLE_LABEL } from '../../../shared/constants';
import { useAuth } from '../../lib/auth';
import { queryClient } from '../../lib/query';
import { Button } from '../ui/Button';
import { Avatar, InfoNote } from '../ui/Layout';
import { Modal } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { SessionWatcher } from './SessionWatcher';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy>
        <img src="/logo.png" alt="ECEWS-ITAMS" className="w-[190px] animate-shimmer" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r-2 border-gray-200 lg:block">
        <Sidebar onSignOut={() => setSignOutOpen(true)} />
      </aside>
      {/* Mobile / tablet top bar + slide-over */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
        <img src="/logo.png" alt="ECEWS-ITAMS" className="h-9 w-auto" />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-gray-200"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-gray-900/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] animate-fade-in shadow-modal">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-sm border border-gray-200 bg-white"
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} onSignOut={() => setSignOutOpen(true)} />
          </div>
        </div>
      ) : null}
      <main id="main" className="lg:pl-[248px]">
        <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-7">
          <Outlet />
        </div>
      </main>
      <SignOutModal open={signOutOpen} onOpenChange={setSignOutOpen} />
      <SessionWatcher />
    </div>
  );
}

export function SignOutModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Sign out?"
      subtitle="You'll need to sign in again to use ITAMS."
      footer={
        <>
          <Button variant="outline" size="lg" className="rounded-[12px] px-6 font-semibold text-gray-800" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="lg"
            loading={busy}
            icon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true);
              try {
                await logout();
                queryClient.clear();
                onOpenChange(false);
                navigate('/login', { replace: true });
              } catch {
                toast.error('Could not sign out. Check your connection and try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-md border-2 border-gray-200 px-4 py-4">
        <Avatar name={user.name} />
        <div>
          <div className="flex items-center gap-2 text-md font-semibold text-gray-900">
            {user.name}
            <span className="rounded-pill bg-green-100 px-2 py-0.5 text-2xs font-semibold text-brand">{ROLE_CHIP[user.role]}</span>
          </div>
          <div className="text-sm text-gray-500">
            {ROLE_LABEL[user.role]} · {user.office}
          </div>
        </div>
      </div>
      <InfoNote icon={Info} className="mt-4">
        Drafts, signature links and the registry are preserved server-side — nothing is lost by signing out.
      </InfoNote>
    </Modal>
  );
}
