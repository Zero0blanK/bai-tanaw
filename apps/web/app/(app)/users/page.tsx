'use client';

import { CreateUserBody, ROLES, type Role } from '@tanaw/shared';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { PageHeader, Pagination } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/utils';
import type { User } from '@/types/api';

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const f = new FormData(formEl);
    const parsed = CreateUserBody.safeParse({ email: f.get('email'), name: f.get('name'), password: f.get('password'), role: f.get('role') });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api('/users', { method: 'POST', body: parsed.data });
      formEl.reset();
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <Field label="Name" htmlFor="u-name">
        <Input id="u-name" name="name" autoComplete="off" />
      </Field>
      <Field label="Email" htmlFor="u-email">
        <Input id="u-email" name="email" type="email" autoComplete="off" />
      </Field>
      <Field label="Temporary password" htmlFor="u-password" hint="12+ characters with upper, lower, digit and symbol. Share it out of band.">
        <Input id="u-password" name="password" type="password" autoComplete="new-password" />
      </Field>
      <Field label="Role" htmlFor="u-role" hint="Assessors run tests and verify findings; viewers only read.">
        <Select id="u-role" name="role" defaultValue="ASSESSOR">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {humanize(r)}
            </option>
          ))}
        </Select>
      </Field>
      {error && (
        <Alert kind="error" className="sm:col-span-2">
          {error}
        </Alert>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={saving}>
          Create user
        </Button>
      </div>
    </form>
  );
}

export default function UsersPage() {
  const { user: me, can } = useAuth();
  const [page, setPage] = useState(1);
  const users = useApi<User[]>(can('ADMIN') ? '/users' : null, { page, limit: 20 });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!can('ADMIN')) return <Alert kind="error">Only admins can manage users.</Alert>;

  async function update(u: User, body: { role?: Role; is_active?: boolean }) {
    setError(null);
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body });
      void users.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(u: User) {
    if (!window.confirm(`Delete ${u.email}? Their history stays, attributed to a deleted user.`)) return;
    setError(null);
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      void users.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Tanaw accounts. Changing a role or deactivating someone signs them out everywhere."
        actions={
          <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'secondary' : 'primary'}>
            <Plus className="h-4 w-4" aria-hidden />
            {showForm ? 'Close' : 'New user'}
          </Button>
        }
      />
      {showForm && (
        <Card className="mb-6">
          <CardHeader title="Create a user" />
          <CardBody>
            <CreateUserForm
              onCreated={() => {
                setShowForm(false);
                void users.reload();
              }}
            />
          </CardBody>
        </Card>
      )}
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}
      <Card>
        {users.loading && !users.data && <Spinner />}
        {users.error && (
          <CardBody>
            <Alert kind="error">{users.error}</Alert>
          </CardBody>
        )}
        {users.data && (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <Td>
                      <p className="font-medium text-ink-800">
                        {u.name} {self && <span className="text-xs text-ink-500">(you)</span>}
                      </p>
                      <p className="text-xs text-ink-500">{u.email}</p>
                    </Td>
                    <Td>
                      <Select aria-label={`Role for ${u.email}`} value={u.role} disabled={self} onChange={(e) => void update(u, { role: e.target.value as Role })} className="w-36">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {humanize(r)}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                    <Td className="whitespace-nowrap text-xs">{formatDateTime(u.last_login_at)}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {!self && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => void update(u, { is_active: !u.is_active })}>
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void remove(u)}>
                            Delete
                          </Button>
                        </>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination meta={users.meta} onPage={setPage} />
      </Card>
    </>
  );
}
