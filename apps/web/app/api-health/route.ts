// Liveness probe for the web container (Docker healthcheck, uptime checks).
export function GET() {
  return Response.json({ status: 'ok' });
}
