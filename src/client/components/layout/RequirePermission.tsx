import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Permission } from '../../../shared/permissions';
import { useAuth } from '../../lib/auth';
import { LinkButton } from '../ui/Button';
import { EmptyState } from '../ui/Layout';

export function RequirePermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (can(perm)) return <>{children}</>;
  return (
    <div className="py-10">
      <EmptyState
        icon={ShieldAlert}
        title="You don’t have access to this page"
        description="Your ITAMS role does not include this area. Ask an IT Admin if you need access."
        action={<LinkButton to="/">Go to dashboard</LinkButton>}
      />
    </div>
  );
}
