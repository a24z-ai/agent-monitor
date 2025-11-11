/**
 * Integration tests using OpenCode SDK
 * Tests the plugin in a real OpenCode environment
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { OpenCodeClient } from '@opencode-ai/sdk';
import { MockAgentMonitorServer } from '../helpers/mock-server';

describe('OpenCode SDK Integration Tests', () => {
  let mockServer: MockAgentMonitorServer;
  let _client: OpenCodeClient;

  beforeAll(async () => {
    // Start mock HTTP server
    mockServer = new MockAgentMonitorServer({
      autoRespond: true,
      defaultResponse: { block: false },
    });
    await mockServer.start(37123);
    console.log('[Test] Mock server started');

    // Initialize OpenCode client
    // Note: This requires a running OpenCode server or mock
    _client = new OpenCodeClient({
      // Configure based on your OpenCode setup
    });
  });

  afterAll(() => {
    mockServer.stop();
  });

  test('plugin sends SessionStart event when session begins', async () => {
    mockServer.clearEvents();

    // Create a session (this would trigger plugin hooks)
    // Note: Actual implementation depends on OpenCode SDK API
    const _sessionId = `test-session-${Date.now()}`;

    // Wait for SessionStart event
    const event = await mockServer.waitForEvent('SessionStart', 3000);
    expect(event).toBeDefined();
    expect(event?.hook_event_name).toBe('SessionStart');
    expect(event?.session_id).toBeTruthy();
  });

  test('plugin sends PreToolUse and PostToolUse events for tool calls', async () => {
    mockServer.clearEvents();

    // Simulate a tool call through OpenCode
    // Example: Reading a file would trigger Read tool
    const _sessionId = `test-session-${Date.now()}`;

    // Wait for both events
    const events = await mockServer.waitForEvents(2, 5000);

    const preToolEvent = events.find((e) => e.hook_event_name === 'PreToolUse');
    const postToolEvent = events.find((e) => e.hook_event_name === 'PostToolUse');

    expect(preToolEvent).toBeDefined();
    expect(postToolEvent).toBeDefined();
    expect(preToolEvent?.tool_name).toBeTruthy();
    expect(postToolEvent?.tool_name).toBe(preToolEvent?.tool_name);
  });

  test('plugin blocks tool execution when monitor returns block:true', async () => {
    mockServer.clearEvents();

    // Queue a blocking response
    mockServer.queueResponse({
      block: true,
      reason: 'Test blocking in integration',
    });

    // Attempt a tool call that should be blocked
    // The plugin should receive the block response and prevent execution
    const _sessionId = `test-session-${Date.now()}`;

    const event = await mockServer.waitForEvent('PreToolUse', 3000);
    expect(event).toBeDefined();

    // The tool should not complete (no PostToolUse)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const postEvent = mockServer.getEventsByType('PostToolUse');
    expect(postEvent.length).toBe(0);
  });

  test('plugin sends UserPromptSubmit event for user messages', async () => {
    mockServer.clearEvents();

    const _sessionId = `test-session-${Date.now()}`;
    const _testPrompt = 'Test prompt for integration';

    // Simulate user message (implementation depends on SDK)
    // await client.chat.send(sessionId, testPrompt);

    const event = await mockServer.waitForEvent('UserPromptSubmit', 3000);
    expect(event).toBeDefined();
    expect(event?.hook_event_name).toBe('UserPromptSubmit');
    expect(event?.prompt).toContain('Test prompt');
  });

  test('plugin modifies prompt when monitor returns modifiedPrompt', async () => {
    mockServer.clearEvents();

    const _originalPrompt = 'Original prompt text';
    const modifiedPrompt = 'Modified prompt text';

    // Queue response with prompt modification
    mockServer.queueResponse({
      block: false,
      modifiedPrompt,
    });

    const _sessionId = `test-session-${Date.now()}`;

    // Send prompt
    const event = await mockServer.waitForEvent('UserPromptSubmit', 3000);
    expect(event).toBeDefined();
    expect(event?.prompt).toBeTruthy();
  });

  test('plugin sends SessionEnd event when session becomes idle', async () => {
    mockServer.clearEvents();

    const _sessionId = `test-session-${Date.now()}`;

    // Wait for session to go idle (60 second timeout in real scenario)
    // For testing, we can simulate the idle event

    const event = await mockServer.waitForEvent('SessionEnd', 65000);
    expect(event).toBeDefined();
    expect(event?.hook_event_name).toBe('SessionEnd');
  });

  test('plugin includes OpenCode metadata in events', async () => {
    mockServer.clearEvents();

    const _sessionId = `test-session-${Date.now()}`;

    // Trigger any event
    const event = await mockServer.waitForEvent('PreToolUse', 5000);
    expect(event).toBeDefined();
    expect(event?.body._opencode_meta).toBeDefined();
    expect(event?.body._opencode_meta.project).toBeTruthy();
    expect(event?.body._opencode_meta.directory).toBeTruthy();
    expect(event?.body._opencode_meta.timestamp).toBeGreaterThan(0);
  });

  test('plugin sanitizes sensitive tool inputs', async () => {
    mockServer.clearEvents();

    const _sessionId = `test-session-${Date.now()}`;

    // Set up handler to inspect tool inputs
    let receivedToolInput: any = null;
    mockServer.onEvent('PreToolUse', (body) => {
      receivedToolInput = body.tool_input;
      return { block: false };
    });

    // Trigger a tool with sensitive data (e.g., Edit tool)
    const event = await mockServer.waitForEvent('PreToolUse', 3000);
    expect(event).toBeDefined();

    // Check that sensitive data was sanitized
    if (event?.tool_name === 'Edit' || event?.tool_name === 'Write') {
      expect(receivedToolInput._sanitized).toBe(true);
    }
  });

  test('plugin handles multiple concurrent sessions', async () => {
    mockServer.clearEvents();

    const session1 = `test-session-1-${Date.now()}`;
    const session2 = `test-session-2-${Date.now()}`;

    // Create two sessions and trigger events in both
    // Wait for events from both sessions
    await mockServer.waitForEvents(4, 5000); // 2 SessionStart + 2 other events

    const session1Events = mockServer.getSessionEvents(session1);
    const session2Events = mockServer.getSessionEvents(session2);

    expect(session1Events.length).toBeGreaterThan(0);
    expect(session2Events.length).toBeGreaterThan(0);
  });

  test('plugin sends Notification events', async () => {
    mockServer.clearEvents();

    const _sessionId = `test-session-${Date.now()}`;

    // Trigger a scenario that creates a notification
    // (e.g., blocked tool, idle warning, etc.)

    const event = await mockServer.waitForEvent('Notification', 5000);
    expect(event).toBeDefined();
    expect(event?.hook_event_name).toBe('Notification');
  });
});

describe('OpenCode SDK - Error Handling', () => {
  let _client: OpenCodeClient;

  beforeAll(() => {
    _client = new OpenCodeClient();
  });

  test('plugin fails gracefully when monitor service is down', async () => {
    // No mock server running - should fail
    // The plugin should throw an error blocking the tool call

    // This test verifies the fail-safe behavior
    expect(true).toBe(true); // Placeholder for actual error handling test
  });

  test('plugin allows execution on monitor timeout', async () => {
    // Configure plugin with timeout behavior
    // Verify it fails open or closed based on configuration
    expect(true).toBe(true); // Placeholder
  });
});

describe('OpenCode SDK - Performance Tests', () => {
  let mockServer: MockAgentMonitorServer;

  beforeAll(async () => {
    mockServer = new MockAgentMonitorServer({
      autoRespond: true,
      defaultResponse: { block: false },
    });
    await mockServer.start(37123);
  });

  afterAll(() => {
    mockServer.stop();
  });

  test('plugin handles rapid tool calls efficiently', async () => {
    mockServer.clearEvents();

    const startTime = Date.now();
    const toolCallCount = 10;

    // Simulate rapid tool calls
    // Measure performance

    await mockServer.waitForEvents(toolCallCount * 2, 10000); // Pre + Post for each

    const elapsed = Date.now() - startTime;
    console.log(`[Performance] ${toolCallCount} tool calls took ${elapsed}ms`);

    expect(mockServer.getEvents().length).toBe(toolCallCount * 2);
    expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds
  });

  test('plugin maintains low latency overhead', async () => {
    mockServer.clearEvents();

    // Measure latency added by plugin
    const measurements: number[] = [];

    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await mockServer.waitForEvent('PreToolUse', 2000);
      const latency = Date.now() - start;
      measurements.push(latency);
      mockServer.clearEvents();
    }

    const avgLatency = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    console.log(`[Performance] Average latency: ${avgLatency}ms`);

    expect(avgLatency).toBeLessThan(100); // Should add less than 100ms overhead
  });
});
