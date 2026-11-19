import { describe, expect, it } from 'vitest';
import { cvss31BaseScore, cvssSeverity, roundUp } from './cvss.js';

describe('CVSS v3.1', () => {
  it.each([
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10.0],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:N/A:N', 4.3],
    ['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N', 3.7],
    ['CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 7.8],
    ['CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N', 6.4],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', 0],
  ])('%s = %d', (vector, score) => {
    expect(cvss31BaseScore(vector)).toBe(score);
  });

  it('rejects malformed vectors', () => {
    expect(cvss31BaseScore('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBeNull();
    expect(cvss31BaseScore('AV:N/AC:L')).toBeNull();
  });

  it('rounds up like the spec, without float noise', () => {
    expect(roundUp(4.02)).toBe(4.1);
    expect(roundUp(4.0)).toBe(4.0);
    expect(roundUp(4.000001)).toBe(4.0);
  });

  it('maps scores to ratings', () => {
    expect([0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10].map(cvssSeverity)).toEqual([
      'INFO', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'CRITICAL', 'CRITICAL',
    ]);
  });
});
