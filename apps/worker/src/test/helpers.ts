import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prisma } from '../config/prisma.js';

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

export async function resetDb(): Promise<void> {
  if (!/test/i.test(new URL(process.env.DATABASE_URL ?? 'postgresql://x/none').pathname)) {
    throw new Error('Refusing to empty a database whose name does not contain "test".');
  }
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${rows.map((r) => `"public"."${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

/** Starts a throwaway HTTP server on 127.0.0.1 and returns its base URL (http://localhost:<port>). */
export async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ url: string; port: number; server: Server; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    port,
    server,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** A fetch stand-in that answers from a map of "METHOD url-prefix" → Response factory. */
export function fakeFetch(routes: Array<[match: (url: URL, init?: RequestInit) => boolean, respond: (url: URL) => Response]>) {
  const calls: URL[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(url);
    const route = routes.find(([match]) => match(url, init));
    if (!route) return new Response('not found', { status: 404 });
    return route[1](url);
  }) as typeof fetch;
  return { impl, calls };
}
