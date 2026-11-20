'use client';

import { CreateTargetBody } from '@tanaw/shared';
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { PageHeader } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Empty, SkeletonRows } from '@/components/ui/feedback';
import { Field, fieldDescribedBy, Input, issuesByField, SearchInput, Textarea } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { Target } from '@/types/api';

function RegisterTargetDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: Target) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const parsed = CreateTargetBody.safeParse({
      name: f.get('name'),
      base_url: f.get('base_url'),
      description: f.get('description') || undefined,
      authorization_note: f.get('authorization_note') || undefined,
      test_window_start: f.get('test_window_start') || undefined,
      test_window_end: f.get('test_window_end') || undefined,
    });
    if (!parsed.success) {
      setErrors(issuesByField(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const res = await api<Target>('/targets', { method: 'POST', body: parsed.data });
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
  const describe = (id: string, hint = false) => fieldDescribedBy(id, { hint, error: errors[id] });

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Register a target"
      description="Only register applications the team has written permission to test. The host must be on the server's allowlist."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="register-target" loading={saving}>
            Register target
          </Button>
        </>
      }
    >
      <form id="register-target" onSubmit={onSubmit} className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2" noValidate>
        <Field label="Name" htmlFor="name" required error={errors.name}>
          <Input id="name" name="name" placeholder="Bayaw Jobs (local)" required data-autofocus="" aria-invalid={Boolean(errors.name)} aria-describedby={describe('name')} />
        </Field>
        <Field label="Base URL" htmlFor="base_url" required hint="Can't be changed later." error={errors.base_url}>
          <Input
            id="base_url"
            name="base_url"
            type="url"
            inputMode="url"
            placeholder="http://host.docker.internal:8787"
            required
            aria-invalid={Boolean(errors.base_url)}
            aria-describedby={describe('base_url', true)}
          />
        </Field>
        <Field label="Test window start" htmlFor="test_window_start" error={errors.test_window_start}>
          <Input id="test_window_start" name="test_window_start" type="datetime-local" aria-invalid={Boolean(errors.test_window_start)} aria-describedby={describe('test_window_start')} />
        </Field>
        <Field label="Test window end" htmlFor="test_window_end" hint="Scans outside the window are refused." error={errors.test_window_end}>
          <Input id="test_window_end" name="test_window_end" type="datetime-local" aria-invalid={Boolean(errors.test_window_end)} aria-describedby={describe('test_window_end', true)} />
        </Field>
        <Field label="Authorization note" htmlFor="authorization_note" className="sm:col-span-2" hint="Who approved testing, and when. Shown in the report." error={errors.authorization_note}>
          <Textarea id="authorization_note" name="authorization_note" rows={2} placeholder="Approved by the instructor by email on 18 Nov 2026" aria-describedby={describe('authorization_note', true)} />
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2" error={errors.description}>
          <Textarea id="description" name="description" rows={2} aria-describedby={describe('description')} />
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

type SortKey = 'name' | 'scans' | 'findings' | 'created_at';

function SortHeader({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 rounded hover:text-ink-900', active && 'text-ink-900')}>
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Th>
  );
}

export default function TargetsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Target[]>('/targets');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });
  const canEdit = can('ADMIN', 'ASSESSOR');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const value = (t: Target): string | number =>
      sort.key === 'name' ? t.name.toLowerCase() : sort.key === 'scans' ? (t._count?.scans ?? 0) : sort.key === 'findings' ? (t._count?.findings ?? 0) : t.created_at;
    return (data ?? [])
      .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.base_url.toLowerCase().includes(needle))
      .sort((a, b) => {
        const [x, y] = [value(a), value(b)];
        const cmp = x < y ? -1 : x > y ? 1 : 0;
        return sort.dir === 'asc' ? cmp : -cmp;
      });
  }, [data, search, sort]);

  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <>
      <PageHeader
        title="Targets"
        description="The applications the team is authorized to test, with their scope and test window."
        actions={
          canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Register target
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b border-ink-100 px-5 py-3">
          <SearchInput label="Search targets" placeholder="Search by name or URL" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-sm" />
        </div>
        {loading && !data && <SkeletonRows rows={3} label="Loading targets" />}
        {error && (
          <div className="p-5">
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        {data && data.length === 0 && (
          <Empty title="No targets yet">{canEdit ? 'Register the application you are authorized to test to start an assessment.' : 'An assessor registers targets.'}</Empty>
        )}
        {data && data.length > 0 && rows.length === 0 && <Empty title={`No targets match "${search}"`}>Try part of the name or URL.</Empty>}
        {rows.length > 0 && (
          <>
            {/* Cards on small screens, a sortable table from md up. */}
            <ul className="divide-y divide-ink-100 md:hidden">
              {rows.map((t) => (
                <li key={t.id}>
                  <Link href={`/targets/${t.id}`} className="block px-5 py-4 hover:bg-ink-50/70">
                    <p className="font-semibold text-ink-900">{t.name}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">{t.base_url}</p>
                    <p className="mt-2 text-xs text-ink-600">
                      {t._count?.scans ?? 0} scans, {t._count?.findings ?? 0} findings, {t._count?.scope_rules ?? 0} scope rules
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <SortHeader label="Target" k="name" sort={sort} onSort={onSort} />
                    <Th className="text-right">Scope rules</Th>
                    <SortHeader label="Scans" k="scans" sort={sort} onSort={onSort} className="text-right" />
                    <SortHeader label="Findings" k="findings" sort={sort} onSort={onSort} className="text-right" />
                    <SortHeader label="Registered" k="created_at" sort={sort} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-ink-50/70">
                      <Td>
                        <Link href={`/targets/${t.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                          {t.name}
                        </Link>
                        <span className="mt-0.5 block text-xs text-ink-500">{t.base_url}</span>
                      </Td>
                      <Td className="text-right tabular-nums">{t._count?.scope_rules ?? 0}</Td>
                      <Td className="text-right tabular-nums">{t._count?.scans ?? 0}</Td>
                      <Td className="text-right tabular-nums">{t._count?.findings ?? 0}</Td>
                      <Td className="text-ink-500">{formatDate(t.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>
      <RegisterTargetDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          setCreating(false);
          toast({ title: 'Target registered', body: `Add scope rules, then run the assessment for ${t.name}.` });
          void reload();
          router.push(`/targets/${t.id}`);
        }}
      />
    </>
  );
}
