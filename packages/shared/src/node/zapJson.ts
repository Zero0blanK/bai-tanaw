// Parses an OWASP ZAP "Traditional JSON" report (Report > Traditional JSON, zap-baseline.py -J, or the
// /OTHER/core/other/jsonreport/ API) into ALERT results. Evidence is redacted before it is stored.

import type { ParsedReport } from '../schemas/scanResults.js';
import { redactNullable } from './redact.js';
import { asArray, truncate } from './util.js';

interface ZapInstance {
  uri?: string;
  method?: string;
  param?: string;
  evidence?: string;
}

interface ZapAlert {
  pluginid?: string;
  alertRef?: string;
  alert?: string;
  name?: string;
  riskcode?: string;
  confidence?: string;
  riskdesc?: string;
  desc?: string;
  solution?: string;
  cweid?: string;
  wascid?: string;
  count?: string;
  instances?: ZapInstance[];
}

interface ZapSite {
  '@name'?: string;
  '@host'?: string;
  '@port'?: string;
  alerts?: ZapAlert[];
}

const RISK = ['Informational', 'Low', 'Medium', 'High'];
const MAX_INSTANCES = 5;

const stripHtml = (value: string | undefined) => value?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function hostOf(value: string): { host: string; port: number } | null {
  try {
    const u = new URL(value);
    return { host: u.hostname, port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80 };
  } catch {
    return null;
  }
}

export function parseZapJson(text: string): ParsedReport {
  let doc: { site?: ZapSite | ZapSite[] };
  try {
    doc = JSON.parse(text) as typeof doc;
  } catch {
    throw new Error('Not valid JSON');
  }
  const sites = asArray(doc?.site);
  if (sites.length === 0) throw new Error('Not a ZAP Traditional JSON report (missing "site")');

  const report: ParsedReport = { hosts: [], results: [] };

  for (const site of sites) {
    const fromName = site['@name'] ? hostOf(site['@name']) : null;
    const host = site['@host'] ?? fromName?.host;
    if (!host) continue;
    const port = site['@port'] ? Number(site['@port']) : fromName?.port;
    report.hosts.push({ host, port });

    for (const alert of site.alerts ?? []) {
      // Every instance URI must be scope-checked too, not just the site host.
      for (const instance of alert.instances ?? []) {
        const target = instance.uri ? hostOf(instance.uri) : null;
        if (target) report.hosts.push(target);
      }
      const instances = (alert.instances ?? []).slice(0, MAX_INSTANCES).map((i) => ({
        uri: truncate(i.uri, 300),
        method: i.method ?? null,
        param: truncate(i.param, 100),
        evidence: redactNullable(truncate(i.evidence, 200)),
      }));

      report.results.push({
        type: 'ALERT',
        data: {
          host,
          plugin_id: alert.pluginid ?? alert.alertRef ?? null,
          name: alert.alert ?? alert.name ?? 'Unnamed alert',
          risk: RISK[Number(alert.riskcode)] ?? alert.riskdesc ?? 'Unknown',
          confidence: alert.confidence ?? null,
          description: truncate(stripHtml(alert.desc), 500),
          solution: truncate(stripHtml(alert.solution), 500),
          cwe_id: alert.cweid ?? null,
          wasc_id: alert.wascid ?? null,
          count: alert.count ? Number(alert.count) || instances.length : instances.length,
          instances,
        },
      });
    }
  }

  if (report.hosts.length === 0) throw new Error('The ZAP report contains no sites');
  return report;
}
