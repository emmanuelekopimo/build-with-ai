import { ShieldAlert } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/** Calm, phone-friendly frame for login-free pages (AB-11). Adds noindex. */
export function PublicShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-16 items-center bg-brand px-4 sm:px-8">
        <span className="sr-only">ECEWS-ITAMS</span>
      </div>
      <main className="mx-auto w-full max-w-[760px] space-y-5 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

export function PublicCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[14px] border-2 border-gray-200 bg-white px-5 py-6 shadow-1 sm:px-6 ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-[0.1em] text-brand">{children}</div>;
}

export function LinkProblem({ state, message, itContact }: { state?: string; message: string; itContact?: string }) {
  const title =
    state === 'expired' ? 'This link has expired' : state === 'used' ? 'This link was already used' : state === 'closed' ? 'This request is closed' : 'This link is not valid';
  return (
    <PublicCard className="text-center">
      <span className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-light text-amber" aria-hidden>
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-[440px] text-md text-gray-600">
        {message} For your security, links work once and expire after 7 days.{' '}
        {itContact ? (
          <>
            Ask the ECEWS IT Department for a new link at{' '}
            <a className="font-semibold text-brand underline" href={`mailto:${itContact}`}>
              {itContact}
            </a>
            .
          </>
        ) : null}
      </p>
    </PublicCard>
  );
}
