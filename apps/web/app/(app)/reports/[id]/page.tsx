'use client';

import { Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { CATEGORY_LABEL, FindingStatusBadge, SeverityBadge } from '@/components/shared/badges';
import { PageHeader } from '@/components/shared/page';
import { EvidenceImage } from '@/components/findings/evidence-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Table, Td, Th } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { formatDateTime, humanize } from '@/lib/utils';
import type { Report } from '@/types/api';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="mb-3 border-b border-slate-200 pb-1 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const report = useApi<Report>(`/targets/${id}/report`);

  if (report.loading && !report.data) return <Spinner label="Building the report…" />;
  if (report.error || !report.data) return <Alert kind="error">{report.error ?? 'Report not available'}</Alert>;
  const r = report.data;
  const s = r.summary;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          crumbs={[
            { href: '/targets', label: 'Targets' },
            { href: `/targets/${r.target.id}`, label: r.target.name },
          ]}
          title="Security assessment report"
          description="Confirmed and fixed findings only. Use Export PDF and choose “Save as PDF” in the print dialog."
          actions={
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden />
              Export PDF
            </Button>
          }
        />
      </div>

      <article className="space-y-8 rounded-lg border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Tanaw · Security assessment report</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{r.target.name}</h1>
          <p className="mt-1 font-mono text-sm text-slate-600">{r.target.base_url}</p>
          <p className="mt-2 text-xs text-slate-500">Generated {formatDateTime(r.generated_at)}</p>
        </header>

        <Section title="1. Executive summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Confirmed (open)', s.open_confirmed],
              ['Fixed', s.fixed],
              ['Pending review', s.pending_review],
              ['All findings', s.findings],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-700">
            Confirmed by severity:{' '}
            {Object.entries(s.confirmed_by_severity).length === 0
              ? 'none'
              : Object.entries(s.confirmed_by_severity)
                  .map(([k, v]) => `${humanize(k)} ${v}`)
                  .join(', ')}
            .
          </p>
        </Section>

        <Section title="2. Scope and authorization">
          <p className="text-sm text-slate-700">
            <b>Authorization:</b> {r.target.authorization_note ?? 'Not recorded.'}
          </p>
          <p className="mt-1 text-sm text-slate-700">
            <b>Test window:</b> {r.target.test_window_start || r.target.test_window_end ? `${formatDateTime(r.target.test_window_start)} to ${formatDateTime(r.target.test_window_end)}` : 'Not set.'}
          </p>
          {r.scope.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
              {r.scope.map((rule, i) => (
                <li key={i}>
                  {rule.in_scope ? 'In scope' : 'Out of scope'}: {humanize(rule.asset_type)} <code className="text-xs">{rule.value}</code>
                  {rule.notes ? ` (${rule.notes})` : ''}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="3. Methodology">
          <p className="text-sm text-slate-700">Process: {r.methodology.phases.join(' → ')}.</p>
          <p className="mt-1 text-sm text-slate-700">Standards: {r.methodology.frameworks.join(', ')}.</p>
          <p className="mt-1 text-sm text-slate-700">Tools used: {r.methodology.tools.length > 0 ? r.methodology.tools.map(humanize).join(', ') : 'none yet'}.</p>
          <p className="mt-1 text-sm text-slate-700">
            AI helped interpret tool output and draft fixes. Every finding below was verified by a human assessor; AI suggestions that were never confirmed are not part of this report.
          </p>
        </Section>

        <Section title="4. Findings">
          {r.findings.length === 0 ? (
            <p className="text-sm text-slate-600">No confirmed findings.</p>
          ) : (
            <div className="space-y-6">
              {r.findings.map((f, i) => (
                <div key={f.id} className="break-inside-avoid-page rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      4.{i + 1} {f.title}
                    </h3>
                    <SeverityBadge severity={f.severity} />
                    <FindingStatusBadge status={f.status} />
                  </div>
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-slate-700 sm:grid-cols-2">
                    <div>Category: {CATEGORY_LABEL[f.category]}</div>
                    <div>
                      CVSS v3.1: {f.cvss_score ?? '-'} {f.cvss_vector && <span className="font-mono">({f.cvss_vector})</span>}
                    </div>
                    <div>OWASP Top 10: {f.owasp_top10 ?? '-'}</div>
                    <div>WSTG: {f.wstg_id ?? '-'}</div>
                    <div className="sm:col-span-2 break-all">
                      Affected asset: <span className="font-mono">{f.affected_asset}</span>
                    </div>
                    <div>
                      Found by: {humanize(f.source)}
                      {f.ai_suggested_severity && ` (AI suggested ${humanize(f.ai_suggested_severity)})`}
                    </div>
                    {f.verified && (
                      <div>
                        Verified by {f.verified.by}, {formatDateTime(f.verified.at)}
                      </div>
                    )}
                  </dl>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{f.description}</p>
                  {f.verified && <p className="mt-2 text-sm text-slate-700"><b>Verification notes:</b> {f.verified.notes}</p>}
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-700">Evidence</p>
                    {f.evidence.length === 0 && <p className="text-xs text-slate-500">None attached.</p>}
                    <ul className="mt-1 space-y-2">
                      {f.evidence.map((e) => (
                        <li key={e.id} className="text-xs">
                          <Badge>{humanize(e.type)}</Badge>
                          {e.content && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[11px] text-slate-700 print:max-h-none">{e.content}</pre>}
                          {e.has_file && e.type === 'SCREENSHOT' && (
                            <div className="mt-1">
                              <EvidenceImage evidenceId={e.id} alt={`Evidence for ${f.title}`} />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-700">Recommendation</p>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-slate-800">{f.remediation ?? 'Not written yet.'}</pre>
                  </div>
                  {f.history.length > 1 && (
                    <p className="mt-2 text-xs text-slate-500">
                      History: {f.history.map((h) => `${humanize(h.to)} by ${h.by} (${formatDateTime(h.at)})`).join(' → ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="5. Scans performed">
          <Table>
            <thead>
              <tr>
                <Th>Tool</Th>
                <Th>Source</Th>
                <Th>Status</Th>
                <Th>Results</Th>
                <Th>Finished</Th>
              </tr>
            </thead>
            <tbody>
              {r.scans.map((sc) => (
                <tr key={sc.id}>
                  <Td>{humanize(sc.tool)}</Td>
                  <Td>{humanize(sc.source)}</Td>
                  <Td>{humanize(sc.status)}</Td>
                  <Td>{sc.results}</Td>
                  <Td>{formatDateTime(sc.finished_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      </article>
    </>
  );
}
