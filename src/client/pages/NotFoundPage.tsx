import { SearchX } from 'lucide-react';
import { LinkButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Layout';

export function NotFoundPage() {
  return (
    <div className="py-10">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="The page you opened does not exist or was moved. Check the link, or go back to the dashboard."
        action={<LinkButton to="/">Go to dashboard</LinkButton>}
      />
    </div>
  );
}
