import { describe, expect, it } from 'vitest';
import { InterpretSchema, RemediationSchema } from './ai.js';
import { AddScopeRuleBody, CreateTargetBody, SetRemediationBody, StartScanBody, VerifyFindingBody } from './api.js';
import { ScanResultInputSchema } from './scanResults.js';

describe('AI reply schemas', () => {
  const finding = {
    title: 'Missing HSTS header',
    category: 'SECURITY_CONFIG',
    affected_asset: 'https://bayawjobs.riomar.dev',
    explanation: 'The response does not include Strict-Transport-Security.',
    evidence_refs: ['r1'],
    suggested_severity: 'LOW',
    owasp_top10: 'A05:2021',
    wstg_id: 'WSTG-CONF-07',
  };

  it('accepts a valid interpret reply and an empty list', () => {
    expect(InterpretSchema.safeParse({ findings: [finding] }).success).toBe(true);
    expect(InterpretSchema.safeParse({ findings: [] }).success).toBe(true);
  });

  it('rejects categories outside the three chosen ones', () => {
    expect(InterpretSchema.safeParse({ findings: [{ ...finding, category: 'INJECTION' }] }).success).toBe(false);
  });

  it('validates remediation drafts', () => {
    const ok = {
      summary: 'Add the HSTS header at the edge.',
      steps: ['Set Strict-Transport-Security'],
      code_example: '',
      references: [],
      confidence: 'HIGH',
    };
    expect(RemediationSchema.safeParse(ok).success).toBe(true);
    expect(RemediationSchema.safeParse({ ...ok, steps: [] }).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('rejects non-http target URLs', () => {
    expect(CreateTargetBody.safeParse({ name: 'Bayaw', base_url: 'file:///etc/passwd' }).success).toBe(false);
    expect(CreateTargetBody.safeParse({ name: 'Bayaw', base_url: 'https://bayawjobs.riomar.dev' }).success).toBe(true);
  });

  it('validates scope rule values per asset type', () => {
    expect(AddScopeRuleBody.safeParse({ asset_type: 'PORT_RANGE', value: '80,443' }).success).toBe(true);
    expect(AddScopeRuleBody.safeParse({ asset_type: 'PORT_RANGE', value: 'abc' }).success).toBe(false);
    expect(AddScopeRuleBody.safeParse({ asset_type: 'URL', value: 'nope' }).success).toBe(false);
    expect(AddScopeRuleBody.safeParse({ asset_type: 'HOST', value: 'a.dev/x' }).success).toBe(false);
  });

  it('only accepts runnable tools for scans', () => {
    expect(StartScanBody.safeParse({ tool: 'MANUAL' }).success).toBe(false);
    expect(StartScanBody.safeParse({ tool: 'NMAP', ports: '80,443' }).success).toBe(true);
  });

  it('never lets an assessor set PENDING', () => {
    expect(VerifyFindingBody.safeParse({ status: 'PENDING', notes: 'reset it' }).success).toBe(false);
  });

  it('needs exactly one of remediation or analysis_id', () => {
    expect(SetRemediationBody.safeParse({}).success).toBe(false);
    expect(SetRemediationBody.safeParse({ remediation: 'Set the header everywhere.' }).success).toBe(true);
  });
});

describe('scan result shapes', () => {
  it('validates a PORT result', () => {
    const r = ScanResultInputSchema.safeParse({
      type: 'PORT',
      data: { host: 'localhost', addresses: ['127.0.0.1'], protocol: 'tcp', port: 8787, state: 'open', reason: 'syn-ack' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a result whose data does not match its type', () => {
    expect(ScanResultInputSchema.safeParse({ type: 'COOKIE', data: { host: 'x' } }).success).toBe(false);
  });
});
