// Nmap service detection (WSTG-INFO-02, NIST 800-115 discovery). Non-destructive by design:
// -sV (version detection) at -T3 (normal timing), no scripts, no OS detection, no UDP.
// Runs with execFile and an argument array; host and ports are validated first.

import { execFile } from 'node:child_process';
import { isSafeNmapHost, isSafeNmapPorts, type ScanResultInput } from '@tanaw/shared';
import { parseNmapXml } from '@tanaw/shared/node';
import type { ToolOutput } from './http.js';

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export function buildNmapArgs(host: string, ports: string): string[] {
  if (!isSafeNmapHost(host)) throw new Error('Refusing to run Nmap: invalid host');
  if (!isSafeNmapPorts(ports)) throw new Error('Refusing to run Nmap: invalid ports');
  // "--" ends option parsing, so the host can never be read as a flag.
  return ['-sV', '-T3', '-Pn', '--max-retries', '2', '-p', ports, '-oX', '-', '--', host];
}

export type ExecFileFn = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; windowsHide: boolean },
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: ExecFileFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const reason = error.killed ? `Nmap timed out after ${options.timeout} ms` : `Nmap failed: ${stderr.trim() || error.message}`;
        reject(new Error(reason.slice(0, 500)));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

export async function runNmap(
  host: string,
  ports: string,
  options: { bin: string; timeoutMs: number; exec?: ExecFileFn },
): Promise<ToolOutput<ScanResultInput> & { hosts: Array<{ host: string; port?: number | undefined }> }> {
  const args = buildNmapArgs(host, ports);
  const { stdout } = await (options.exec ?? defaultExec)(options.bin, args, {
    timeout: options.timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  const report = parseNmapXml(stdout);
  return { results: report.results, hosts: report.hosts, raw: { ext: 'xml', content: stdout } };
}
