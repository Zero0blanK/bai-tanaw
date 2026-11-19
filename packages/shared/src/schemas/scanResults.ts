// Shapes of scan_results.data per result type (AGENT.md §7.4).
// Kept identical to the prototype so the AI prompts and the UI carry over.

import { z } from 'zod';

const str = z.string();
/** Missing values are stored as null (same as the prototype). */
const optStr = z.string().nullable();

export const HeaderResponseSchema = z.object({
  check: z.literal('response'),
  url: str,
  status: z.number().int(),
  location: optStr,
});
export const HeaderSecuritySchema = z.object({
  check: z.literal('security_header'),
  url: str,
  header: str,
  present: z.boolean(),
  value: optStr,
});
export const HeaderDisclosureSchema = z.object({
  check: z.literal('disclosure_header'),
  url: str,
  header: str,
  value: str,
});
export const HeaderDataSchema = z.discriminatedUnion('check', [
  HeaderResponseSchema,
  HeaderSecuritySchema,
  HeaderDisclosureSchema,
]);

export const CookieDataSchema = z.object({
  url: str,
  name: str,
  secure: z.boolean(),
  http_only: z.boolean(),
  same_site: optStr,
  has_expiry: z.boolean(),
  path: optStr,
});

export const CorsDataSchema = z.object({
  url: str,
  probe_origin: str,
  allow_origin: optStr,
  allow_credentials: z.boolean(),
  reflects_foreign_origin: z.boolean(),
  wildcard: z.boolean(),
});

export const RedirectDataSchema = z.object({
  from: str,
  /** null when the plain-HTTP request failed (see error). */
  status: z.number().int().nullable(),
  location: optStr,
  redirects_to_https: z.boolean().nullable(),
  error: z.string().optional(),
});

export const DnsRecordDataSchema = z.object({
  host: str,
  record_type: str,
  name: str,
  ttl: z.number().int().nullable(),
  value: str,
});

export const EndpointDataSchema = z.object({
  method: str,
  path: str,
  summary: optStr,
  tags: z.array(str),
  requires_auth: z.boolean(),
  admin_route: z.boolean(),
});

export const PortDataSchema = z.object({
  host: str,
  addresses: z.array(str),
  protocol: str,
  port: z.number().int(),
  state: str,
  reason: optStr,
});

export const ServiceDataSchema = z.object({
  host: str,
  port: z.number().int(),
  name: optStr,
  product: optStr,
  version: optStr,
  extra: optStr,
});

export const AlertInstanceSchema = z.object({
  uri: optStr,
  method: optStr,
  param: optStr,
  evidence: optStr,
});

export const AlertDataSchema = z.object({
  host: str,
  plugin_id: optStr,
  name: str,
  risk: str,
  confidence: optStr,
  description: optStr,
  solution: optStr,
  cwe_id: optStr,
  wasc_id: optStr,
  count: z.number().int(),
  instances: z.array(AlertInstanceSchema),
});

export type HeaderData = z.infer<typeof HeaderDataSchema>;
export type CookieData = z.infer<typeof CookieDataSchema>;
export type CorsData = z.infer<typeof CorsDataSchema>;
export type RedirectData = z.infer<typeof RedirectDataSchema>;
export type DnsRecordData = z.infer<typeof DnsRecordDataSchema>;
export type EndpointData = z.infer<typeof EndpointDataSchema>;
export type PortData = z.infer<typeof PortDataSchema>;
export type ServiceData = z.infer<typeof ServiceDataSchema>;
export type AlertData = z.infer<typeof AlertDataSchema>;

/** A parsed result ready to insert into scan_results. */
export const ScanResultInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('HEADER'), data: HeaderDataSchema }),
  z.object({ type: z.literal('COOKIE'), data: CookieDataSchema }),
  z.object({ type: z.literal('CORS'), data: CorsDataSchema }),
  z.object({ type: z.literal('REDIRECT'), data: RedirectDataSchema }),
  z.object({ type: z.literal('DNS_RECORD'), data: DnsRecordDataSchema }),
  z.object({ type: z.literal('ENDPOINT'), data: EndpointDataSchema }),
  z.object({ type: z.literal('PORT'), data: PortDataSchema }),
  z.object({ type: z.literal('SERVICE'), data: ServiceDataSchema }),
  z.object({ type: z.literal('ALERT'), data: AlertDataSchema }),
]);
export type ScanResultInput = z.infer<typeof ScanResultInputSchema>;

/** What a report parser (Nmap XML, ZAP JSON) returns: the hosts to scope-check and the results. */
export interface ParsedReport {
  hosts: Array<{ host: string; port?: number | undefined }>;
  results: ScanResultInput[];
}
