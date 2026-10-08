import { zodResolver } from '@hookform/resolvers/zod';
import { Info, LogIn, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../components/ui/Button';
import { Field, TextInput } from '../components/ui/Controls';
import { InfoNote } from '../components/ui/Layout';
import { Modal } from '../components/ui/Overlay';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your work email.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { user, login, sessionEnded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur' });
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (user) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await login(v.email, v.password);
      navigate(from, { replace: true });
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not sign in. Try again.');
    }
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-[420px] rounded-[20px] border-2 border-gray-200 bg-white px-7 py-8 shadow-3">
        <img src="/logo.png" alt="ECEWS-ITAMS — IT Asset Management System" width={205} height={59} className="mx-auto h-auto w-[205px]" />
        <h1 className="mt-6 text-xl font-bold text-gray-900">Sign in</h1>
        <p className="mt-1 text-md text-gray-500">ITAMS accounts are for the ECEWS IT unit only.</p>
        {sessionEnded ? (
          <InfoNote icon={Info} className="mt-4">
            Your session ended. Sign in again to continue — your drafts are saved.
          </InfoNote>
        ) : null}
        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          <Field label="Email address" htmlFor="email" error={formState.errors.email?.message}>
            <TextInput id="email" type="email" autoComplete="username" placeholder="name@ecews.org" invalid={!!formState.errors.email} {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
            <TextInput id="password" type="password" autoComplete="current-password" invalid={!!formState.errors.password} {...register('password')} />
          </Field>
          {formError ? (
            <p role="alert" className="rounded-sm bg-red-light px-3 py-2 text-sm font-medium text-red">
              {formError}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} icon={<LogIn className="h-4 w-4" />}>
            Sign in
          </Button>
        </form>
        <div className="mt-4 text-center">
          <button type="button" onClick={() => setForgotOpen(true)} className="text-md font-semibold text-brand hover:underline">
            Forgot password?
          </button>
        </div>
      </div>
      <ForgotPasswordModal open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  );
}

const forgotSchema = z.object({ email: z.string().trim().min(1, 'Enter your work email.').email('Enter a valid email address.') });

export function ForgotPasswordModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast();
  const { register, handleSubmit, formState, reset } = useForm<{ email: string }>({
    resolver: zodResolver(forgotSchema),
    mode: 'onBlur',
  });
  const [error, setError] = useState<string | null>(null);
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api<{ message: string }>('/auth/forgot', { body: v });
      toast.success(r.message);
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the reset link.');
    }
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Forgot password?"
      subtitle="Enter your work email — we'll send you a secure reset link."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" loading={formState.isSubmitting} icon={<Send className="h-4 w-4" />} onClick={() => void submit()}>
            Send reset link
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Field label="Email address" htmlFor="forgot-email" error={formState.errors.email?.message ?? error ?? undefined}>
          <TextInput id="forgot-email" type="email" placeholder="name@ecews.org" invalid={!!formState.errors.email} {...register('email')} />
        </Field>
      </form>
      <InfoNote icon={ShieldCheck} className="mt-4">
        The link is single-use and valid for 24 hours. ITAMS accounts are IT-unit only.
      </InfoNote>
    </Modal>
  );
}
