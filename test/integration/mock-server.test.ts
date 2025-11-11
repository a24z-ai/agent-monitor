/**
 * Tests for the mock server itself and real plugin integration
 * These tests actually load and run the plugin against the mock server
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MockAgentMonitorServer } from '../helpers/mock-server';

describe('Mock Server Integration', () => {
  let mockServer: MockAgentMonitorServer;
  let serverPort: number;

  beforeEach(async () => {
    mockServer = new MockAgentMonitorServer({
      autoRespond: true,
      defaultResponse: { block: false },
    });
    await mockServer.start(); // Dynamic port allocation
    serverPort = mockServer.getPort();
  });

  afterEach(() => {
    if (mockServer) {
      mockServer.stop();
    }
  });

  test('mock server starts and accepts connections', async () => {
    expect(mockServer.isRunning()).toBe(true);
    expect(serverPort).toBeGreaterThan(0);

    // Send test request
    const response = await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'test',
        tool_name: 'Bash',
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.block).toBe(false);
  });

  test('mock server records events correctly', async () => {
    mockServer.clearEvents();

    await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'test-123',
        tool_name: 'Read',
        tool_input: { file_path: '/test/file.txt' },
      }),
    });

    const events = mockServer.getEvents();
    expect(events.length).toBe(1);
    expect(events[0].hook_event_name).toBe('PreToolUse');
    expect(events[0].session_id).toBe('test-123');
    expect(events[0].tool_name).toBe('Read');
  });

  test('mock server uses queued responses', async () => {
    mockServer.queueResponse({ block: true, reason: 'Test block' });
    mockServer.queueResponse({ block: false });

    // First request should block
    const response1 = await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'PreToolUse' }),
    });
    const data1 = await response1.json();
    expect(data1.block).toBe(true);
    expect(data1.reason).toBe('Test block');

    // Second request should allow
    const response2 = await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'PreToolUse' }),
    });
    const data2 = await response2.json();
    expect(data2.block).toBe(false);
  });

  test('mock server custom event handlers work', async () => {
    let handlerCalled = false;
    mockServer.onEvent('UserPromptSubmit', (body) => {
      handlerCalled = true;
      return {
        block: false,
        modifiedPrompt: `Modified: ${body.prompt}`,
      };
    });

    const response = await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Test prompt',
      }),
    });

    const data = await response.json();
    expect(handlerCalled).toBe(true);
    expect(data.modifiedPrompt).toBe('Modified: Test prompt');
  });

  test('mock server filters events by type', async () => {
    mockServer.clearEvents();

    // Send multiple event types
    await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'PreToolUse' }),
    });

    await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'PostToolUse' }),
    });

    await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'PreToolUse' }),
    });

    const preToolEvents = mockServer.getEventsByType('PreToolUse');
    const postToolEvents = mockServer.getEventsByType('PostToolUse');

    expect(preToolEvents.length).toBe(2);
    expect(postToolEvents.length).toBe(1);
  });

  test('mock server waitForEvent works correctly', async () => {
    mockServer.clearEvents();

    // Send event after delay
    setTimeout(async () => {
      await fetch(`http://localhost:${serverPort}/agent-monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook_event_name: 'SessionStart',
          session_id: 'delayed-session',
        }),
      });
    }, 500);

    const event = await mockServer.waitForEvent('SessionStart', 2000);
    expect(event).toBeDefined();
    expect(event?.hook_event_name).toBe('SessionStart');
    expect(event?.session_id).toBe('delayed-session');
  });

  test('mock server filters events by session', async () => {
    mockServer.clearEvents();

    // Send events for different sessions
    await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'session-1',
      }),
    });

    await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PostToolUse',
        session_id: 'session-1',
      }),
    });

    await fetch(`http://localhost:${serverPort}/agent-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'session-2',
      }),
    });

    const session1Events = mockServer.getSessionEvents('session-1');
    const session2Events = mockServer.getSessionEvents('session-2');

    expect(session1Events.length).toBe(2);
    expect(session2Events.length).toBe(1);
  });
});

describe('Real Plugin with Mock Server', () => {
  let mockServer: MockAgentMonitorServer;
  let plugin: any;

  beforeEach(async () => {
    // Start mock server
    mockServer = new MockAgentMonitorServer({
      autoRespond: true,
      defaultResponse: { block: false },
    });
    await mockServer.start(37123);

    // Load the real plugin
    const pluginModule = await import('../../src/opencode/full-claude-plugin.ts');
    plugin = await pluginModule.FullClaudeMonitorPlugin({
      project: { name: 'test-project' },
      directory: '/test/directory',
      worktree: '/test/worktree',
    });
  });

  afterEach(() => {
    mockServer.stop();
  });

  test('plugin sends SessionStart on first tool call', async () => {
    mockServer.clearEvents();

    // Trigger tool execution
    await plugin['tool.execute.before'](
      { tool: 'Read', sessionID: 'real-test-session', callID: 'call-1' },
      { args: { file_path: '/test/file.txt' } }
    );

    const events = mockServer.getEvents();
    const sessionStart = events.find((e) => e.hook_event_name === 'SessionStart');
    const preTool = events.find((e) => e.hook_event_name === 'PreToolUse');

    expect(sessionStart).toBeDefined();
    expect(preTool).toBeDefined();
    expect(sessionStart?.session_id).toBe('real-test-session');
  });

  test('plugin blocks tool when server returns block:true', async () => {
    mockServer.clearEvents();
    mockServer.queueResponses([
      { block: false }, // SessionStart
      { block: true, reason: 'Blocked by test' }, // PreToolUse
    ]);

    await expect(
      plugin['tool.execute.before'](
        { tool: 'Bash', sessionID: 'blocked-session', callID: 'call-1' },
        { args: { command: 'rm -rf /' } }
      )
    ).rejects.toThrow('Blocked by test');

    const events = mockServer.getEvents();
    const preTool = events.find((e) => e.hook_event_name === 'PreToolUse');
    expect(preTool).toBeDefined();
  });

  test('plugin sends PostToolUse after tool completion', async () => {
    mockServer.clearEvents();

    // Pre-execute
    await plugin['tool.execute.before'](
      { tool: 'Grep', sessionID: 'post-test', callID: 'call-1' },
      { args: { pattern: 'test', path: '/test' } }
    );

    mockServer.clearEvents(); // Clear SessionStart and PreToolUse

    // Post-execute
    await plugin['tool.execute.after'](
      { tool: 'Grep', sessionID: 'post-test', callID: 'call-1' },
      { title: 'Search complete', output: 'Results here', metadata: {} }
    );

    const events = mockServer.getEvents();
    const postTool = events.find((e) => e.hook_event_name === 'PostToolUse');

    expect(postTool).toBeDefined();
    expect(postTool?.tool_name).toBe('Grep');
    expect(postTool?.body.tool_response).toBeDefined();
  });

  test('plugin sanitizes sensitive tool inputs', async () => {
    mockServer.clearEvents();

    await plugin['tool.execute.before'](
      { tool: 'Edit', sessionID: 'sanitize-test', callID: 'call-1' },
      {
        args: {
          file_path: '/test/file.txt',
          old_string: 'sensitive data here',
          new_string: 'more sensitive data',
        },
      }
    );

    const events = mockServer.getEvents();
    const preTool = events.find((e) => e.hook_event_name === 'PreToolUse');

    expect(preTool).toBeDefined();
    expect(preTool?.body.tool_input._sanitized).toBe(true);
    expect(preTool?.body.tool_input.old_string).toBeUndefined();
    expect(preTool?.body.tool_input.new_string).toBeUndefined();
  });

  test('plugin sends SessionEnd on session.idle event', async () => {
    mockServer.clearEvents();

    // Initialize session
    await plugin['tool.execute.before'](
      { tool: 'Read', sessionID: 'idle-test', callID: 'call-1' },
      { args: { file_path: '/test.txt' } }
    );

    mockServer.clearEvents();

    // Send idle event
    await plugin.event({
      event: {
        type: 'session.idle',
        properties: { sessionID: 'idle-test' },
      },
    });

    const events = mockServer.getEvents();
    const sessionEnd = events.find((e) => e.hook_event_name === 'SessionEnd');

    expect(sessionEnd).toBeDefined();
    expect(sessionEnd?.session_id).toBe('idle-test');
  });

  test('plugin includes OpenCode metadata in all events', async () => {
    mockServer.clearEvents();

    await plugin['tool.execute.before'](
      { tool: 'Glob', sessionID: 'meta-test', callID: 'call-1' },
      { args: { pattern: '**/*.ts' } }
    );

    const events = mockServer.getEvents();
    for (const event of events) {
      expect(event.body._opencode_meta).toBeDefined();
      expect(event.body._opencode_meta.project).toBe('test-project');
      expect(event.body._opencode_meta.directory).toBe('/test/directory');
      expect(event.body._opencode_meta.worktree).toBe('/test/worktree');
      expect(event.body._opencode_meta.timestamp).toBeGreaterThan(0);
    }
  });

  test('plugin handles context injection in responses', async () => {
    mockServer.clearEvents();

    // Queue response with context injection
    mockServer.queueResponses([
      { block: false }, // SessionStart
      { block: false, contextToInject: 'Important context here' }, // PreToolUse
    ]);

    await plugin['tool.execute.before'](
      { tool: 'Read', sessionID: 'context-test', callID: 'call-1' },
      { args: { file_path: '/test.txt' } }
    );

    // The context should be stored for later injection
    // We can verify it's applied in PostToolUse
    const output = { title: 'File read', output: 'content' };
    await plugin['tool.execute.after'](
      { tool: 'Read', sessionID: 'context-test', callID: 'call-1' },
      output
    );

    expect((output as any).contextInjected).toBe('Important context here');
  });
});
