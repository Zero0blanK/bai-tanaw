// CVSS v3.1 base score calculator (FIRST specification, section 7.1 and Appendix A).
// Used to check that the score an assessor enters matches the vector, and to show the rating.

import type { Severity } from './enums/index.js';

const WEIGHTS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

const PR_UNCHANGED = { N: 0.85, L: 0.62, H: 0.27 } as const;
const PR_CHANGED = { N: 0.85, L: 0.68, H: 0.5 } as const;

const VECTOR_RE = /^CVSS:3\.1\/AV:([NALP])\/AC:([LH])\/PR:([NLH])\/UI:([NR])\/S:([UC])\/C:([NLH])\/I:([NLH])\/A:([NLH])$/;

/** CVSS "Roundup": smallest number with one decimal that is >= the input (spec Appendix A, float-safe). */
export function roundUp(value: number): number {
  const intInput = Math.round(value * 100_000);
  if (intInput % 10_000 === 0) return intInput / 100_000;
  return (Math.floor(intInput / 10_000) + 1) / 10;
}

/** Base score for a CVSS v3.1 base vector, or null if the vector is malformed. */
export function cvss31BaseScore(vector: string): number | null {
  const m = VECTOR_RE.exec(vector.trim());
  if (!m) return null;
  const [, av, ac, pr, ui, s, c, i, a] = m as unknown as [string, 'N' | 'A' | 'L' | 'P', 'L' | 'H', 'N' | 'L' | 'H', 'N' | 'R', 'U' | 'C', 'N' | 'L' | 'H', 'N' | 'L' | 'H', 'N' | 'L' | 'H'];
  const changed = s === 'C';

  const iss = 1 - (1 - WEIGHTS.CIA[c]) * (1 - WEIGHTS.CIA[i]) * (1 - WEIGHTS.CIA[a]);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  const exploitability = 8.22 * WEIGHTS.AV[av] * WEIGHTS.AC[ac] * (changed ? PR_CHANGED[pr] : PR_UNCHANGED[pr]) * WEIGHTS.UI[ui];

  if (impact <= 0) return 0;
  return changed ? roundUp(Math.min(1.08 * (impact + exploitability), 10)) : roundUp(Math.min(impact + exploitability, 10));
}

/** Qualitative rating (CVSS v3.1 table 14). 0.0 maps to INFO, Tanaw's "None". */
export function cvssSeverity(score: number): Severity {
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  if (score >= 0.1) return 'LOW';
  return 'INFO';
}
