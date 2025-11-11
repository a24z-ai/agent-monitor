/**
 * Simple test to verify mock server is working correctly
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { MockAgentMonitorServer } from '../helpers/mock-server';

describe('Simple Mock Server Test', () => {
  let mockServer: MockAgentMonitorServer;

  beforeAll(async () => {
    mockServer = new MockAgentMonitorServer({
      autoRespond: true,
      defaultResponse: { block: false },
    });
    await mockServer.start(37123);
    console.log('[Test] Server started, isRunning:', mockServer.isRunning());
  });

  afterAll(() => {
    mockServer.stop();
  });

  test('server receives and records events', async () => {
    console.log('[Test] Before fetch, events:', mockServer.getEvents().length);

    const response = await fetch('http://localhost:37123/agent-monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'test-123',
        tool_name: 'Read',
      }),
    });

    console.log('[Test] Response status:', response.status);
    const data = await response.json();
    console.log('[Test] Response data:', data);

    console.log('[Test] After fetch, events:', mockServer.getEvents().length);
    const events = mockServer.getEvents();
    console.log('[Test] Events:', events);

    expect(events.length).toBe(1);
    expect(events[0].hook_event_name).toBe('PreToolUse');
    expect(events[0].session_id).toBe('test-123');
  });

  test('server uses queued responses correctly', async () => {
    mockServer.clearEvents();

    mockServer.queueResponse({ block: true, reason: 'Test' });

    const response = await fetch('http://localhost:37123/agent-monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PreToolUse',
      }),
    });

    const data = await response.json();
    console.log('[Test] Queued response data:', data);

    expect(data.block).toBe(true);
    expect(data.reason).toBe('Test');
  });
});
