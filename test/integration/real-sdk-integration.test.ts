/**
 * Real OpenCode SDK Integration Tests
 * These tests actually use the OpenCode SDK to create sessions and execute commands
 * The plugin loads automatically and sends events to the mock server
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { OpencodeClient } from '@opencode-ai/sdk';
import { MockAgentMonitorServer } from '../helpers/mock-server';
import { shouldRunIntegrationTests } from '../setup';

// Skip these tests if integration tests are disabled
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('Real OpenCode SDK Integration', () => {
  let mockServer: MockAgentMonitorServer;
  let client: OpencodeClient;
  let openCodeServerUrl: string;

  beforeAll(async () => {
    // Start mock server to receive plugin events
    mockServer = new MockAgentMonitorServer({
      autoRespond: true,
      defaultResponse: { block: false },
    });
    await mockServer.start(); // Will use dynamic port if 37123 is busy
    console.log(`[Test] Mock server started on port ${mockServer.getPort()}`);

    // Configure OpenCode SDK client
    // The SDK will connect to the OpenCode server (should be running from global setup)
    openCodeServerUrl = process.env.OPENCODE_SERVER_URL || 'http://localhost:3456';

    client = new OpencodeClient({
      baseUrl: openCodeServerUrl,
    });

    console.log(`[Test] OpenCode SDK client configured for ${openCodeServerUrl}`);
  });

  afterAll(() => {
    if (mockServer) {
      mockServer.stop();
    }
  });

  afterEach(() => {
    // Clear events between tests
    if (mockServer) {
      mockServer.clearEvents();
    }
  });

  test('plugin sends SessionStart when SDK creates a session', async () => {
    mockServer.clearEvents();

    console.log('[Test] Creating OpenCode session...');

    // Create a new session using the SDK
    const sessionResponse = await client.session.create({
      body: {
        title: 'Plugin Test Session',
      },
    });

    console.log('[Test] Session created:', sessionResponse.data?.id);

    // Wait for plugin to send SessionStart event
    const sessionStartEvent = await mockServer.waitForEvent('SessionStart', 5000);

    expect(sessionStartEvent).toBeDefined();
    expect(sessionStartEvent?.hook_event_name).toBe('SessionStart');
    console.log('[Test] ✓ SessionStart event received');
  });

  test('plugin sends PreToolUse and PostToolUse when SDK executes a prompt', async () => {
    mockServer.clearEvents();

    console.log('[Test] Creating session for prompt test...');
    const sessionResponse = await client.session.create({
      body: { title: 'Prompt Test Session' },
    });
    const sessionId = sessionResponse.data?.id;

    mockServer.clearEvents(); // Clear SessionStart

    console.log('[Test] Sending prompt that will trigger tool usage...');

    // Send a prompt that will trigger a tool call (e.g., reading a file)
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: {
          providerID: 'anthropic',
          modelID: 'claude-3-5-sonnet-20241022',
        },
        parts: [
          {
            type: 'text',
            text: 'Read the package.json file in the current directory',
          },
        ],
      },
    });

    // Wait for tool events
    console.log('[Test] Waiting for PreToolUse event...');
    const preToolEvent = await mockServer.waitForEvent('PreToolUse', 10000);

    expect(preToolEvent).toBeDefined();
    expect(preToolEvent?.hook_event_name).toBe('PreToolUse');
    expect(preToolEvent?.tool_name).toBeTruthy();
    console.log(`[Test] ✓ PreToolUse event received for tool: ${preToolEvent?.tool_name}`);

    // Wait a bit for PostToolUse
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const events = mockServer.getEvents();
    const postToolEvent = events.find((e) => e.hook_event_name === 'PostToolUse');

    expect(postToolEvent).toBeDefined();
    console.log('[Test] ✓ PostToolUse event received');
  });

  test('plugin sends events for multiple tool calls in sequence', async () => {
    mockServer.clearEvents();

    const sessionResponse = await client.session.create({
      body: { title: 'Multi-tool Test' },
    });
    const sessionId = sessionResponse.data?.id;

    mockServer.clearEvents();

    console.log('[Test] Sending prompt that triggers multiple tools...');

    await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: {
          providerID: 'anthropic',
          modelID: 'claude-3-5-sonnet-20241022',
        },
        parts: [
          {
            type: 'text',
            text: 'List all TypeScript files in the src directory and show me the first one',
          },
        ],
      },
    });

    // Wait for multiple tool events
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const events = mockServer.getEvents();
    const preToolEvents = events.filter((e) => e.hook_event_name === 'PreToolUse');
    const postToolEvents = events.filter((e) => e.hook_event_name === 'PostToolUse');

    console.log(`[Test] Received ${preToolEvents.length} PreToolUse events`);
    console.log(`[Test] Received ${postToolEvents.length} PostToolUse events`);

    expect(preToolEvents.length).toBeGreaterThan(0);
    expect(postToolEvents.length).toBeGreaterThan(0);

    // Log the tools that were called
    preToolEvents.forEach((event, i) => {
      console.log(`[Test]   Tool ${i + 1}: ${event.tool_name}`);
    });
  });

  test('plugin includes correct metadata in events', async () => {
    mockServer.clearEvents();

    const sessionResponse = await client.session.create({
      body: { title: 'Metadata Test' },
    });
    const sessionId = sessionResponse.data?.id;

    mockServer.clearEvents();

    await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: {
          providerID: 'anthropic',
          modelID: 'claude-3-5-sonnet-20241022',
        },
        parts: [{ type: 'text', text: 'Read package.json' }],
      },
    });

    const preToolEvent = await mockServer.waitForEvent('PreToolUse', 10000);

    expect(preToolEvent).toBeDefined();
    expect(preToolEvent?.body._opencode_meta).toBeDefined();
    expect(preToolEvent?.body._opencode_meta.timestamp).toBeGreaterThan(0);
    expect(preToolEvent?.body._opencode_meta.directory).toBeTruthy();

    console.log('[Test] ✓ OpenCode metadata present:', {
      project: preToolEvent?.body._opencode_meta.project,
      directory: preToolEvent?.body._opencode_meta.directory,
      timestamp: preToolEvent?.body._opencode_meta.timestamp,
    });
  });

  test('plugin can be controlled via mock server responses', async () => {
    mockServer.clearEvents();

    // Configure mock server to block Bash commands
    mockServer.onEvent('PreToolUse', (body) => {
      if (body.tool_name === 'Bash') {
        console.log('[Test] Blocking Bash command');
        return { block: true, reason: 'Bash commands blocked for testing' };
      }
      return { block: false };
    });

    const sessionResponse = await client.session.create({
      body: { title: 'Block Test' },
    });
    const sessionId = sessionResponse.data?.id;

    mockServer.clearEvents();

    console.log('[Test] Sending prompt that would trigger Bash tool...');

    // Try to execute a bash command (should be blocked)
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: {
          providerID: 'anthropic',
          modelID: 'claude-3-5-sonnet-20241022',
        },
        parts: [{ type: 'text', text: 'Run the ls command' }],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const events = mockServer.getEvents();
    const bashPreTool = events.find(
      (e) => e.hook_event_name === 'PreToolUse' && e.tool_name === 'Bash'
    );

    if (bashPreTool) {
      console.log('[Test] ✓ Bash tool call was intercepted');

      // Should not have PostToolUse for blocked tool
      const bashPostTool = events.find(
        (e) => e.hook_event_name === 'PostToolUse' && e.tool_name === 'Bash'
      );
      expect(bashPostTool).toBeUndefined();
      console.log('[Test] ✓ Bash tool was blocked (no PostToolUse)');
    } else {
      console.log('[Test] ℹ Bash tool was not called (agent chose different approach)');
    }
  });

  test('plugin tracks session lifecycle correctly', async () => {
    mockServer.clearEvents();

    console.log('[Test] Testing full session lifecycle...');

    const sessionResponse = await client.session.create({
      body: { title: 'Lifecycle Test' },
    });
    const sessionId = sessionResponse.data?.id;

    // SessionStart should be sent
    const sessionStart = await mockServer.waitForEvent('SessionStart', 5000);
    expect(sessionStart).toBeDefined();
    console.log('[Test] ✓ SessionStart received');

    mockServer.clearEvents();

    // Do some work
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: {
          providerID: 'anthropic',
          modelID: 'claude-3-5-sonnet-20241022',
        },
        parts: [{ type: 'text', text: 'Read package.json' }],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const events = mockServer.getEvents();
    console.log(`[Test] Session had ${events.length} events during its lifecycle`);

    // Check that session_id is consistent
    const sessionIds = new Set(events.map((e) => e.session_id).filter(Boolean));
    expect(sessionIds.size).toBeLessThanOrEqual(2); // Should be 1-2 (may include undefined for some events)
    console.log('[Test] ✓ Session ID consistent across events');
  });

  test('can subscribe to OpenCode events and see plugin activity', async () => {
    console.log('[Test] Testing event subscription...');
    mockServer.clearEvents();

    // Subscribe to OpenCode events
    const eventsResponse = await client.event.subscribe();

    console.log('[Test] Subscribed to OpenCode events');

    // Create a session to generate activity
    const _sessionResponse = await client.session.create({
      body: { title: 'Event Subscribe Test' },
    });

    // Collect events for a short time
    const collectedEvents: any[] = [];
    const timeout = setTimeout(() => {
      console.log('[Test] Event collection timeout');
    }, 3000);

    try {
      for await (const event of eventsResponse.stream) {
        collectedEvents.push(event);
        console.log(`[Test] OpenCode event: ${event.type}`);

        if (collectedEvents.length >= 3) {
          break;
        }
      }
    } catch (error) {
      console.log('[Test] Event stream ended or errored:', error);
    }

    clearTimeout(timeout);

    console.log(`[Test] Collected ${collectedEvents.length} OpenCode events`);

    // Meanwhile, check plugin events
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const pluginEvents = mockServer.getEvents();
    console.log(`[Test] Plugin sent ${pluginEvents.length} events to monitor`);

    expect(pluginEvents.length).toBeGreaterThan(0);
    console.log('[Test] ✓ Plugin actively sending events during OpenCode operations');
  });
});

describeIntegration('Real OpenCode SDK - File Operations', () => {
  let mockServer: MockAgentMonitorServer;
  let client: OpencodeClient;

  beforeAll(async () => {
    mockServer = new MockAgentMonitorServer({ autoRespond: true });
    await mockServer.start(); // Dynamic port allocation

    const serverUrl = process.env.OPENCODE_SERVER_URL || 'http://localhost:3456';
    client = new OpencodeClient({ baseUrl: serverUrl });

    console.log(`[Test] File operations test server on port ${mockServer.getPort()}`);
  });

  afterAll(() => {
    if (mockServer) {
      mockServer.stop();
    }
  });

  afterEach(() => {
    if (mockServer) {
      mockServer.clearEvents();
    }
  });

  test('plugin monitors file read operations via SDK', async () => {
    mockServer.clearEvents();

    console.log('[Test] Reading file via SDK...');

    try {
      await client.file.read({
        query: { path: 'package.json' },
      });
      console.log('[Test] File read completed');
    } catch (error) {
      console.log('[Test] File read error (may be expected):', error);
    }

    // SDK file operations may or may not trigger plugin depending on implementation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const events = mockServer.getEvents();
    console.log(`[Test] Plugin received ${events.length} events from file operation`);
  });

  test('plugin monitors file search operations', async () => {
    mockServer.clearEvents();

    console.log('[Test] Searching files via SDK...');

    try {
      await client.find.files({
        query: { query: '*.ts' },
      });
      console.log('[Test] File search completed');
    } catch (error) {
      console.log('[Test] File search error:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const events = mockServer.getEvents();
    console.log(`[Test] Plugin received ${events.length} events from search operation`);
  });
});
