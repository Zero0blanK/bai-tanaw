'use client';

import { LoginBody } from '@tanaw/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, fieldDescribedBy, Input, issuesByField } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';

export function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = LoginBody.safeParse({ email: form.get('email'), password: form.get('password') });
    if (!parsed.success) {
      const byField = issuesByField(parsed.error.issues);
      setFieldErrors({
        ...(byField.email ? { email: 'Enter the email address of your Bai-Tanaw account' } : {}),
        ...(byField.password ? { password: 'Enter your password' } : {}),
      });
      return;
    }
    setFieldErrors({});
    setError(null);
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      router.replace('/dashboard');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" autoComplete="username" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldDescribedBy('email', { error: fieldErrors.email })} />
      </Field>
      <Field label="Password" htmlFor="password" error={fieldErrors.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldDescribedBy('password', { error: fieldErrors.password })}
        />
      </Field>
      {error && <Alert kind="error">{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        Sign in
      </Button>
    </form>
  );
}
