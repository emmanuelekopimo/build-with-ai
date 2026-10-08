import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../components/ui/Button';
import { Field, TextInput } from '../components/ui/Controls';
import { EmptyState } from '../components/ui/Layout';
import { api, ApiError } from '../lib/api';

const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Use at least 10 characters.')
      .regex(/[A-Za-z]/, 'Include at least one letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirm: z.string().min(1, 'Repeat the new password.'),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] });

export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), mode: 'onBlur' });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api('/auth/reset', { body: { token, ...v } });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reset the password.');
    }
  });
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-[420px] rounded-[20px] border-2 border-gray-200 bg-white px-7 py-8 shadow-3">
        <img src="/logo.png" alt="ECEWS-ITAMS" width={205} height={59} className="mx-auto h-auto w-[205px]" />
        {done ? (
          <EmptyState
            className="mt-6"
            icon={KeyRound}
            title="Password updated"
            description="All other sessions were signed out. Sign in with your new password."
            action={
              <Link to="/login" className="font-semibold text-brand hover:underline">
                Go to sign in
              </Link>
            }
          />
        ) : (
          <>
            <h1 className="mt-6 text-xl font-bold text-gray-900">Choose a new password</h1>
            <p className="mt-1 text-md text-gray-500">At least 10 characters, with a letter and a number.</p>
            <form onSubmit={submit} noValidate className="mt-5 space-y-4">
              <Field label="New password" htmlFor="pw" error={formState.errors.password?.message}>
                <TextInput id="pw" type="password" autoComplete="new-password" invalid={!!formState.errors.password} {...register('password')} />
              </Field>
              <Field label="Repeat password" htmlFor="pw2" error={formState.errors.confirm?.message}>
                <TextInput id="pw2" type="password" autoComplete="new-password" invalid={!!formState.errors.confirm} {...register('confirm')} />
              </Field>
              {error ? (
                <p role="alert" className="rounded-sm bg-red-light px-3 py-2 text-sm font-medium text-red">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
                Update password
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
