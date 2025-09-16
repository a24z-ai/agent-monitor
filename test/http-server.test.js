import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import http from 'node:http';

// Helper function to handle requests
function handleRequest(body, res) {
  try {
    const event = JSON.parse(body);

    // Simple test logic: block any tool containing 'dangerous'
    if (event.type === 'tool.pre_execute') {
      const shouldBlock = event.args?.command?.includes('dangerous') ?? false;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          block: shouldBlock,
          reason: shouldBlock ? 'Dangerous command detected' : undefined,
        })
      );
    } else {
      res.writeHead(200);
      res.end('OK');
    }
  } catch (_error) {
    res.writeHead(400);
    res.end('Bad Request');
  }
}

describe('HTTP Server Integration', () => {
  let server;
  let serverPort;

  beforeAll(async () => {
    // Start a test server that mimics the VSCode extension
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/agent-monitor') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          handleRequest(body, res);
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // Start server on random port
    serverPort = await new Promise((resolve) => {
      server.listen(0, 'localhost', () => {
        resolve(server.address().port);
      });
    });
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  test('server responds to valid agent monitor events', async () => {
    const event = {
      type: 'tool.pre_execute',
      timestamp: Date.now(),
      project: 'test',
      directory: '/test',
      worktree: '/test',
      tool: 'bash',
      sessionID: 'test-session',
      callID: 'test-call',
      args: {
        command: 'ls -la',
      },
    };

    const response = await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result).toEqual({ block: false });
  });

  test('server blocks dangerous commands', async () => {
    const event = {
      type: 'tool.pre_execute',
      timestamp: Date.now(),
      project: 'test',
      directory: '/test',
      worktree: '/test',
      tool: 'bash',
      sessionID: 'test-session',
      callID: 'test-call',
      args: {
        command: 'dangerous rm -rf /',
      },
    };

    const response = await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result).toEqual({
      block: true,
      reason: 'Dangerous command detected',
    });
  });

  test('server handles non-blocking events', async () => {
    const event = {
      type: 'session.started',
      timestamp: Date.now(),
      project: 'test',
      directory: '/test',
      worktree: '/test',
      sessionID: 'test-session',
      startTime: Date.now(),
    };

    const response = await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.ok).toBe(true);
    const result = await response.text();
    expect(result).toBe('OK');
  });

  test('server returns 400 for invalid JSON', async () => {
    const response = await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    });

    expect(response.status).toBe(400);
  });

  test('server returns 404 for wrong endpoint', async () => {
    const response = await fetch(`http://localhost:${serverPort}/wrong-endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
  });
});
