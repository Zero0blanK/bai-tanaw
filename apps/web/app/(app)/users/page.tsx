'use client';

import { CreateUserBody, ROLES, type Role } from '@tanaw/shared';
import { Check, Minus, MoreHorizontal, Plus, Power, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { PageHeader, Pagination } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Empty, SkeletonRows } from '@/components/ui/feedback';
import { Field, fieldDescribedBy, Input, issuesByField, SearchInput, Select } from '@/components/ui/form';
import { Menu } from '@/components/ui/menu';
import { Table, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/utils';
import type { User } from '@/types/api';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Everything, plus users, audit log and settings.',
  ASSESSOR: 'Runs assessments and verifies findings.',
  VIEWER: 'Reads the dashboard, findings and reports.',
};

/** Mirrors the API's role checks (ROLE_GROUPS in apps/api/src/middlewares/auth.ts). The API is the real guard. */
const PERMISSIONS: Array<{ label: string; roles: Role[] }> = [
  { label: 'View dashboard, targets, scans, findings and reports', roles: ['ADMIN', 'ASSESSOR', 'VIEWER'] },
  { label: 'Register targets and edit scope rules', roles: ['ADMIN', 'ASSESSOR'] },
  { label: 'Run assessments and import reports', roles: ['ADMIN', 'ASSESSOR'] },
  { label: 'Request AI suggestions (counts toward the daily limit)', roles: ['ADMIN', 'ASSESSOR'] },
  { label: 'Verify findings, add evidence and remediation', roles: ['ADMIN', 'ASSESSOR'] },
  { label: 'Download raw tool output', roles: ['ADMIN', 'ASSESSOR'] },
  { label: 'Manage users and roles', roles: ['ADMIN'] },
  { label: 'Read the audit log', roles: ['ADMIN'] },
  { label: 'Change AI provider settings and key', roles: ['ADMIN'] },
];

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: User) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const parsed = CreateUserBody.safeParse({ email: f.get('email'), name: f.get('name'), password: f.get('password'), role: f.get('role') });
    if (!parsed.success) {
      setErrors(issuesByField(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const res = await api<User>('/users', { method: 'POST', body: parsed.data });
      onCreated(res.data);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const close = () => {
    setErrors({});
    setFormError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Create a user"
      description="They sign in with this email and temporary password, then change it on their Account page."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="create-user" loading={saving}>
            Create user
          </Button>
        </>
      }
    >
      <form id="create-user" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Full name" htmlFor="u-name" required error={errors.name}>
          <Input id="u-name" name="name" autoComplete="off" required data-autofocus="" aria-invalid={Boolean(errors.name)} aria-describedby={fieldDescribedBy('u-name', { error: errors.name })} />
        </Field>
        <Field label="Email" htmlFor="u-email" required error={errors.email}>
          <Input id="u-email" name="email" type="email" autoComplete="off" placeholder="name@school.edu" required aria-invalid={Boolean(errors.email)} aria-describedby={fieldDescribedBy('u-email', { error: errors.email })} />
        </Field>
        <Field label="Temporary password" htmlFor="u-password" required hint="12+ characters with upper and lower case, a digit and a symbol. Share it outside Bai-Tanaw." error={errors.password} className="sm:col-span-2">
          <Input
            id="u-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(errors.password)}
            aria-describedby={fieldDescribedBy('u-password', { hint: true, error: errors.password })}
          />
        </Field>
        <Field label="Role" htmlFor="u-role" required className="sm:col-span-2">
          <Select id="u-role" name="role" defaultValue="ASSESSOR">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}: {ROLE_HELP[r]}
              </option>
            ))}
          </Select>
        </Field>
        {formError && (
          <Alert kind="error" className="sm:col-span-2">
            {formError}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}

function RolesMatrix() {
  return (
    <Card>
      <Table>
        <caption className="px-5 pt-5 pb-3 text-left text-[13px] leading-relaxed text-ink-500">
          Roles are fixed. The server checks every request against them; hiding a button in the app is only a convenience.
        </caption>
        <thead>
          <tr>
            <Th>Permission</Th>
            {ROLES.map((r) => (
              <Th key={r} className="text-center">
                {humanize(r)}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((p) => (
            <tr key={p.label}>
              <Td className="text-ink-800">{p.label}</Td>
              {ROLES.map((r) => (
                <Td key={r} className="text-center">
                  {p.roles.includes(r) ? (
                    <span className="inline-flex items-center gap-1 text-brand-700">
                      <Check className="h-4 w-4" aria-hidden />
                      <span className="text-xs font-semibold">Yes</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-ink-400">
                      <Minus className="h-4 w-4" aria-hidden />
                      <span className="text-xs">No</span>
                    </span>
                  )}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export default function UsersPage() {
  const { user: me, can } = useAuth();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const users = useApi<User[]>(can('ADMIN') ? '/users' : null, { page, limit: 50 });
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (users.data ?? []).filter(
      (u) => (!roleFilter || u.role === roleFilter) && (!needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)),
    );
  }, [users.data, search, roleFilter]);

  if (!can('ADMIN')) return <Alert kind="error">Only admins can manage users.</Alert>;

  async function update(u: User, body: { role?: Role; is_active?: boolean }, message: string) {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body });
      toast({ title: message, body: u.email });
      void users.reload();
    } catch (e) {
      toast({ kind: 'error', title: 'Change not saved', body: errorMessage(e) });
    }
  }

  async function changeRole(u: User, role: Role) {
    const ok = await confirm({
      title: `Make ${u.name} ${humanize(role).toLowerCase() === 'admin' ? 'an admin' : `a ${humanize(role).toLowerCase()}`}?`,
      body: `${ROLE_HELP[role]} The change applies to their next request.`,
      confirmLabel: 'Change role',
    });
    if (ok) await update(u, { role }, `Role changed to ${humanize(role)}`);
  }

  async function toggleActive(u: User) {
    if (u.is_active) {
      const ok = await confirm({
        title: `Deactivate ${u.name}?`,
        body: 'They are signed out everywhere and cannot sign in until you activate them again. Their history stays.',
        confirmLabel: 'Deactivate',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await update(u, { is_active: !u.is_active }, u.is_active ? 'User deactivated' : 'User activated');
  }

  async function remove(u: User) {
    const ok = await confirm({
      title: `Delete ${u.name}?`,
      body: `${u.email} is removed permanently. Their scans, findings and audit entries stay, shown as a deleted user. Deactivating is usually enough.`,
      confirmLabel: 'Delete user',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      toast({ title: 'User deleted', body: u.email });
      void users.reload();
    } catch (e) {
      toast({ kind: 'error', title: 'User not deleted', body: errorMessage(e) });
    }
  }

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Who can sign in to Bai-Tanaw and what each role may do. Role changes and deactivation apply immediately."
        actions={
          tab === 'users' && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New user
            </Button>
          )
        }
      />
      <Tabs
        label="Users and roles"
        value={tab}
        onChange={(v) => setTab(v as 'users' | 'roles')}
        tabs={[
          { value: 'users', label: 'Users', count: users.meta?.total ?? users.data?.length },
          { value: 'roles', label: 'Roles & permissions' },
        ]}
      />

      {tab === 'roles' ? (
        <RolesMatrix />
      ) : (
        <Card>
          <div className="flex flex-col gap-2 border-b border-ink-100 px-5 py-3 sm:flex-row">
            <SearchInput label="Search users" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs sm:flex-1" />
            <Select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')} className="h-10 sm:w-44">
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </Select>
          </div>
          {users.loading && !users.data && <SkeletonRows rows={3} label="Loading users" />}
          {users.error && (
            <div className="p-5">
              <Alert kind="error">{users.error}</Alert>
            </div>
          )}
          {users.data && shown.length === 0 && <Empty title="No users match">Try another name, email or role.</Empty>}
          {shown.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th className="hidden md:table-cell">Status</Th>
                  <Th className="hidden lg:table-cell">Last sign-in</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-ink-50/70">
                      <Td>
                        <p className="font-semibold text-ink-900">
                          {u.name} {self && <span className="text-xs font-normal text-ink-500">(you)</span>}
                        </p>
                        <p className="text-xs text-ink-500">{u.email}</p>
                        <p className="mt-1 md:hidden">{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</p>
                      </Td>
                      <Td>
                        <Select
                          aria-label={`Role for ${u.email}`}
                          value={u.role}
                          disabled={self}
                          title={self ? 'You cannot change your own role' : undefined}
                          onChange={(e) => void changeRole(u, e.target.value as Role)}
                          className="h-9 w-36"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {humanize(r)}
                            </option>
                          ))}
                        </Select>
                      </Td>
                      <Td className="hidden md:table-cell">{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                      <Td className="hidden whitespace-nowrap text-ink-500 lg:table-cell">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</Td>
                      <Td className="w-12 text-right">
                        {!self && (
                          <Menu
                            label={`Actions for ${u.email}`}
                            triggerClassName="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                            trigger={<MoreHorizontal className="h-5 w-5" aria-hidden />}
                            items={[
                              { kind: 'action', label: u.is_active ? 'Deactivate' : 'Activate', onSelect: () => void toggleActive(u), icon: <Power className="h-4 w-4" aria-hidden /> },
                              { kind: 'separator' },
                              { kind: 'action', label: 'Delete user', tone: 'danger', onSelect: () => void remove(u), icon: <Trash2 className="h-4 w-4" aria-hidden /> },
                            ]}
                          />
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
      )}

      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(u) => {
          setCreating(false);
          toast({ title: 'User created', body: `${u.email} can now sign in.` });
          void users.reload();
        }}
      />
    </>
  );
}
