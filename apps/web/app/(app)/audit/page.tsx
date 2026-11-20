'use client';

import { useState } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { PageHeader, Pagination } from '@/components/shared/page';
import { Badge, type Tone } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Alert, Empty, Spinner } from '@/components/ui/feedback';
import { Label, Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { formatDateTime, humanize } from '@/lib/utils';
import type { AuditLog } from '@/types/api';

// Mirrors AUDIT_ACTIONS in apps/api/src/services/audit.service.ts.
const ACTIONS = [
  'login_success', 'login_failed', 'login_locked', 'logout', 'password_changed', 'refresh_reuse_detected',
  'user_created', 'user_updated', 'user_deleted',
  'target_created', 'target_updated', 'scope_rule_added', 'scope_rule_deleted', 'scope_blocked',
  'scan_started', 'report_imported', 'ai_requested',
  'finding_created', 'finding_verified', 'remediation_set', 'evidence_added', 'report_exported',
  'settings_updated',
];

function tone(action: string): Tone {
  if (action === 'scope_blocked' || action === 'refresh_reuse_detected' || action === 'login_locked') return 'red';
  if (action === 'login_failed') return 'amber';
  if (action.startsWith('login') || action === 'logout' || action === 'password_changed') return 'slate';
  if (action === 'ai_requested') return 'purple';
  return 'blue';
}

export default function AuditPage() {
  const { can } = useAuth();
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const logs = useApi<AuditLog[]>(can('ADMIN') ? '/audit-logs' : null, { action, page, limit: 50 });

  if (!can('ADMIN')) return <Alert kind="error">Only admins can read the audit log.</Alert>;

  return (
    <>
      <PageHeader title="Audit log" description="Sign-ins, scope blocks, scans, AI requests, verifications and report exports." />
      <Card>
        <div className="border-b border-slate-100 px-5 py-4 sm:w-72">
          <Label htmlFor="audit-action">Action</Label>
          <Select
            id="audit-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
              </option>
            ))}
          </Select>
        </div>
        {logs.loading && !logs.data && <Spinner />}
        {logs.error && (
          <CardBody>
            <Alert kind="error">{logs.error}</Alert>
          </CardBody>
        )}
        {logs.data?.length === 0 && <Empty title="No entries" />}
        {logs.data && logs.data.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Who</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(l.created_at)}</Td>
                  <Td>
                    <Badge tone={tone(l.action)}>{humanize(l.action)}</Badge>
                  </Td>
                  <Td className="text-xs">
                    {l.actor ? l.actor.name : '-'}
                    {l.ip && <div className="text-slate-400">{l.ip}</div>}
                  </Td>
                  <Td>
                    {l.metadata && <code className="block max-w-xl whitespace-pre-wrap break-all text-[11px] text-slate-600">{JSON.stringify(l.metadata)}</code>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={logs.meta} onPage={setPage} />
      </Card>
    </>
  );
}
