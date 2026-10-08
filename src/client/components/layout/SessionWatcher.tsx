import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { Button } from '../ui/Button';
import { InfoNote } from '../ui/Layout';
import { Modal } from '../ui/Overlay';

const WARN_BEFORE_MS = 2 * 60000;

/** Warns before the idle session expires (D38). Drafts live server-side, so nothing is lost. */
export function SessionWatcher() {
  const { user, idleMs, lastActivity, refresh, logout } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  if (!user) return null;
  const expiresAt = lastActivity + idleMs;
  const remaining = expiresAt - now;
  const open = remaining < WARN_BEFORE_MS;
  return (
    <Modal
      open={open}
      onOpenChange={() => undefined}
      title="Still there?"
      subtitle="Your ITAMS session is about to end because of inactivity."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => void logout()}>
            Sign out
          </Button>
          <Button
            size="lg"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await refresh().finally(() => setBusy(false));
            }}
          >
            Stay signed in
          </Button>
        </>
      }
    >
      <InfoNote icon={Clock}>
        {remaining > 0
          ? `About ${Math.max(1, Math.round(remaining / 60000))} minute(s) left. Drafts are saved on the server, so nothing is lost either way.`
          : 'Your session may have ended. Drafts are saved on the server.'}
      </InfoNote>
    </Modal>
  );
}
