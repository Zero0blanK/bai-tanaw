import type { ScanResultType } from '@tanaw/shared';
import { Badge } from '@/components/ui/badge';

type Data = Record<string, unknown>;

const s = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));
const yes = (v: unknown, good = true) => (v === null || v === undefined ? <Badge>unknown</Badge> : v === good ? <Badge tone="green">yes</Badge> : <Badge tone="red">no</Badge>);

/** One-line, human summary of a scan result. Shapes: packages/shared/src/schemas/scanResults.ts. */
export function ResultSummary({ type, data }: { type: ScanResultType; data: Data }) {
  switch (type) {
    case 'HEADER':
      if (data.check === 'response') return <span>Response <b>{s(data.status)}</b> from <code className="text-xs">{s(data.url)}</code>{data.location ? <> → {s(data.location)}</> : null}</span>;
      if (data.check === 'security_header')
        return (
          <span className="flex flex-wrap items-center gap-2">
            <code className="text-xs">{s(data.header)}</code>
            {data.present ? <Badge tone="green">present</Badge> : <Badge tone="amber">missing</Badge>}
            {data.value ? <span className="break-all text-xs text-ink-500">{s(data.value)}</span> : null}
          </span>
        );
      return (
        <span className="flex flex-wrap items-center gap-2">
          <code className="text-xs">{s(data.header)}</code>
          <Badge tone="orange">discloses</Badge>
          <span className="text-xs text-ink-600">{s(data.value)}</span>
        </span>
      );
    case 'COOKIE':
      return (
        <span className="flex flex-wrap items-center gap-2">
          <code className="text-xs">{s(data.name)}</code>
          <span className="text-xs">Secure</span> {yes(data.secure)}
          <span className="text-xs">HttpOnly</span> {yes(data.http_only)}
          <span className="text-xs">SameSite</span> <Badge>{s(data.same_site)}</Badge>
        </span>
      );
    case 'CORS':
      return (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs">Allow-Origin</span> <code className="text-xs">{s(data.allow_origin)}</code>
          {data.reflects_foreign_origin ? <Badge tone="red">reflects foreign origin</Badge> : null}
          {data.wildcard ? <Badge tone="amber">wildcard</Badge> : null}
          {/* Allow-Credentials only matters when an origin is actually allowed. */}
          {data.allow_credentials && data.allow_origin ? <Badge tone="amber">credentials allowed</Badge> : null}
        </span>
      );
    case 'REDIRECT':
      return (
        <span className="flex flex-wrap items-center gap-2">
          <code className="text-xs">{s(data.from)}</code> → {s(data.status)} {s(data.location)}
          <span className="text-xs">to HTTPS</span> {yes(data.redirects_to_https)}
          {data.error ? <span className="text-xs text-ink-500">{s(data.error)}</span> : null}
        </span>
      );
    case 'DNS_RECORD':
      return (
        <span>
          <Badge>{s(data.record_type)}</Badge> <code className="ml-1 break-all text-xs">{s(data.value)}</code>
          {data.ttl !== null && data.ttl !== undefined ? <span className="ml-2 text-xs text-ink-500">TTL {s(data.ttl)}</span> : null}
        </span>
      );
    case 'ENDPOINT':
      return (
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{s(data.method)}</Badge>
          <code className="text-xs">{s(data.path)}</code>
          {data.requires_auth ? <Badge>auth</Badge> : <Badge tone="amber">public</Badge>}
          {data.admin_route ? <Badge tone="purple">admin</Badge> : null}
          {data.summary ? <span className="text-xs text-ink-500">{s(data.summary)}</span> : null}
        </span>
      );
    case 'PORT':
      return (
        <span>
          {s(data.host)}:{s(data.port)}/{s(data.protocol)} <Badge tone={data.state === 'open' ? 'amber' : 'slate'}>{s(data.state)}</Badge>
        </span>
      );
    case 'SERVICE':
      return (
        <span>
          {s(data.host)}:{s(data.port)} <b>{s(data.name)}</b> {data.product ? s(data.product) : ''} {data.version ? s(data.version) : ''}
        </span>
      );
    case 'ALERT': {
      const instances = Array.isArray(data.instances) ? (data.instances as Data[]) : [];
      return (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.risk === 'High' ? 'red' : data.risk === 'Medium' ? 'amber' : data.risk === 'Low' ? 'blue' : 'slate'}>{s(data.risk)}</Badge>
            <b>{s(data.name)}</b>
            {data.cwe_id ? <span className="text-xs text-ink-500">CWE-{s(data.cwe_id)}</span> : null}
          </div>
          {instances.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-ink-600">
              {instances.map((i, n) => (
                <li key={n} className="break-all">
                  {s(i.method)} {s(i.uri)}
                  {i.evidence ? <span className="text-ink-400"> · {s(i.evidence)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
  }
}
