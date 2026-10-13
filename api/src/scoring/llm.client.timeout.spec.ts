import http from 'node:http';
import { AddressInfo } from 'node:net';
import { LlmClient } from './llm.client';

/**
 * Regression test with a real HTTP server: it sends the response headers immediately,
 * then never finishes the body. The timeout must cover the whole call, not just the headers.
 */
describe('LlmClient timeout (real HTTP)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"choices": [');
      // ...and never call res.end()
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  it('rejects with reason timeout when the body stalls after the headers arrive', async () => {
    const client = new LlmClient({ baseUrl, apiKey: null, model: 'm', timeoutMs: 300 });
    const started = Date.now();
    await expect(
      client.score({ jobTitle: 't', jobDescription: 'd', requiredSkills: [], resumeText: 'r' }),
    ).rejects.toMatchObject({ reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
