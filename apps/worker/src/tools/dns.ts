// DNS reconnaissance (WSTG-INFO-02/04) with node:dns/promises.

import { Resolver } from 'node:dns/promises';
import type { CaaRecord } from 'node:dns';
import type { ScanResultInput } from '@tanaw/shared';
import { truncate } from '@tanaw/shared/node';
import type { ToolOutput } from './http.js';

export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'] as const;
type RecordType = (typeof RECORD_TYPES)[number];

/** The subset of Resolver we use, so tests can pass a fake. */
export interface DnsResolver {
  resolve4(host: string, options: { ttl: true }): Promise<Array<{ address: string; ttl: number }>>;
  resolve6(host: string, options: { ttl: true }): Promise<Array<{ address: string; ttl: number }>>;
  resolveCname(host: string): Promise<string[]>;
  resolveMx(host: string): Promise<Array<{ priority: number; exchange: string }>>;
  resolveTxt(host: string): Promise<string[][]>;
  resolveNs(host: string): Promise<string[]>;
  resolveCaa(host: string): Promise<CaaRecord[]>;
}

/** "No such record" answers: skip quietly. Anything else is a real failure. */
const EMPTY_CODES = new Set(['ENODATA', 'ENOTFOUND', 'ENONAME', 'NOTFOUND', 'ENOTIMP']);

async function lookup(resolver: DnsResolver, host: string, type: RecordType): Promise<Array<{ value: string; ttl: number | null }>> {
  switch (type) {
    case 'A':
      return (await resolver.resolve4(host, { ttl: true })).map((r) => ({ value: r.address, ttl: r.ttl }));
    case 'AAAA':
      return (await resolver.resolve6(host, { ttl: true })).map((r) => ({ value: r.address, ttl: r.ttl }));
    case 'CNAME':
      return (await resolver.resolveCname(host)).map((value) => ({ value, ttl: null }));
    case 'MX':
      return (await resolver.resolveMx(host)).map((r) => ({ value: `${r.priority} ${r.exchange}`, ttl: null }));
    case 'TXT':
      return (await resolver.resolveTxt(host)).map((chunks) => ({ value: chunks.join(''), ttl: null }));
    case 'NS':
      return (await resolver.resolveNs(host)).map((value) => ({ value, ttl: null }));
    case 'CAA':
      return (await resolver.resolveCaa(host)).map((r) => {
        const { critical, ...rest } = r;
        const [tag, val] = Object.entries(rest)[0] ?? ['', ''];
        return { value: `${critical} ${tag} "${String(val)}"`, ttl: null };
      });
  }
}

export async function runDnsLookup(host: string, resolver: DnsResolver = new Resolver({ timeout: 5_000, tries: 2 })): Promise<ToolOutput<ScanResultInput>> {
  const results: ScanResultInput[] = [];
  const errors: string[] = [];

  for (const type of RECORD_TYPES) {
    try {
      for (const record of await lookup(resolver, host, type)) {
        results.push({
          type: 'DNS_RECORD',
          data: { host, record_type: type, name: host, ttl: record.ttl, value: truncate(record.value, 500) ?? '' },
        });
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!EMPTY_CODES.has(code)) errors.push(`${type}: ${code || (error as Error).message}`);
    }
  }

  if (results.length === 0 && errors.length > 0) throw new Error(`DNS lookup failed (${errors.join('; ')})`);
  return { results };
}
