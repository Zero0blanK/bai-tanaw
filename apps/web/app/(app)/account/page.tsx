'use client';

import { ChangePasswordBody } from '@tanaw/shared';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { DetailList, PageHeader } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Field, fieldDescribedBy, Input, issuesByField } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, setAccessToken } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/utils';

export default function AccountPage() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const f = new FormData(formEl);
    const parsed = ChangePasswordBody.safeParse({ current_password: f.get('current_password'), new_password: f.get('new_password') });
    const next = parsed.success ? {} : issuesByField(parsed.error.issues);
    if (f.get('new_password') !== f.get('confirm_password')) next.confirm_password = 'The two new passwords do not match';
    setErrors(next);
    if (!parsed.success || Object.keys(next).length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ access_token: string }>('/auth/password', { method: 'POST', body: parsed.data });
      // The API revoked every session and issued a new one for this tab.
      setAccessToken(res.data.access_token);
      formEl.reset();
      toast({ title: 'Password changed', body: 'Every other session was signed out.' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Account" description="Your sign-in details." />
      {user && (
        <Card className="mb-6">
          <CardBody>
            <DetailList
              items={[
                ['Name', user.name],
                ['Email', user.email],
                ['Role', humanize(user.role)],
                ['Last sign-in', user.last_login_at ? formatDateTime(user.last_login_at) : 'Never'],
              ]}
            />
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Change password" description="Changing it signs out every other session." />
        <CardBody>
          <form onSubmit={submit} className="grid max-w-md grid-cols-1 gap-4" noValidate>
            <Field label="Current password" htmlFor="pw-current" required error={errors.current_password}>
              <Input id="pw-current" name="current_password" type="password" autoComplete="current-password" required aria-invalid={Boolean(errors.current_password)} aria-describedby={fieldDescribedBy('pw-current', { error: errors.current_password })} />
            </Field>
            <Field label="New password" htmlFor="pw-new" required hint="12+ characters with upper and lower case, a digit and a symbol." error={errors.new_password}>
              <Input id="pw-new" name="new_password" type="password" autoComplete="new-password" required aria-invalid={Boolean(errors.new_password)} aria-describedby={fieldDescribedBy('pw-new', { hint: true, error: errors.new_password })} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm" required error={errors.confirm_password}>
              <Input id="pw-confirm" name="confirm_password" type="password" autoComplete="new-password" required aria-invalid={Boolean(errors.confirm_password)} aria-describedby={fieldDescribedBy('pw-confirm', { error: errors.confirm_password })} />
            </Field>
            {error && <Alert kind="error">{error}</Alert>}
            <div>
              <Button type="submit" loading={saving}>
                Change password
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
