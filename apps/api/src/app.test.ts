import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const app = createApp();

describe('app skeleton', () => {
  it('GET /api/health returns the envelope', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('sets security headers and hides X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['permissions-policy']).toContain('camera=()');
  });

  it('unknown routes return a 404 envelope', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, data: null });
  });

  it('malformed JSON returns 400, not 500', async () => {
    const res = await request(app).post('/api/health').set('content-type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
