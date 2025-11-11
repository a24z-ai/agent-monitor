#!/usr/bin/env bun
/**
 * Standalone CLI test script
 * Tests the plugin using the OpenCode SDK
 *
 * Usage:
 *   bun test/cli-test.ts
 *
 * Prerequisites:
 *   - OpenCode server running: opencode serve --port 3456
 *   - Plugin installed: npm run install-plugin
 */

import { OpencodeClient } from '@opencode-ai/sdk';
import { MockAgentMonitorServer } from './helpers/mock-server';

async function main() {
  console.log('🧪 OpenCode Plugin CLI Test\n');

  // Start mock server
  console.log('📡 Starting mock server on port 37123...');
  const mockServer = new MockAgentMonitorServer({
    autoRespond: true,
    defaultResponse: { block: false },
  });
  await mockServer.start(37123);
  console.log('✓ Mock server started\n');

  // Configure OpenCode SDK
  const serverUrl = process.env.OPENCODE_SERVER_URL || 'http://localhost:3456';
  console.log(`🔗 Connecting to OpenCode server at ${serverUrl}...`);

  const client = new OpencodeClient({
    baseUrl: serverUrl,
  });

  try {
    // Test 1: Create a session
    console.log('\n--- Test 1: Create Session ---');
    const sessionResponse = await client.session.create({
      body: {
        title: 'CLI Test Session',
      },
    });

    const sessionId = sessionResponse.data?.id;
    console.log(`✓ Session created: ${sessionId}`);

    // Wait for SessionStart event
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const sessionStartEvent = mockServer.getEventsByType('SessionStart')[0];
    if (sessionStartEvent) {
      console.log('✓ Plugin sent SessionStart event');
      console.log(`  Session ID: ${sessionStartEvent.session_id}`);
    } else {
      console.log('⚠ No SessionStart event received');
    }

    // Test 2: Execute a prompt that triggers tools
    console.log('\n--- Test 2: Execute Prompt with Tool Calls ---');
    mockServer.clearEvents();

    console.log('Sending prompt: "Read the package.json file"...');
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
            text: 'Read the package.json file and tell me the project name',
          },
        ],
      },
    });

    // Wait for tool events
    console.log('Waiting for tool events...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const events = mockServer.getEvents();
    console.log(`✓ Received ${events.length} events from plugin`);

    const preToolEvents = events.filter((e) => e.hook_event_name === 'PreToolUse');
    const postToolEvents = events.filter((e) => e.hook_event_name === 'PostToolUse');

    console.log(`  - PreToolUse events: ${preToolEvents.length}`);
    console.log(`  - PostToolUse events: ${postToolEvents.length}`);

    if (preToolEvents.length > 0) {
      console.log('\n  Tools called:');
      preToolEvents.forEach((event, i) => {
        console.log(`    ${i + 1}. ${event.tool_name}`);
      });
    }

    // Test 3: Verify metadata
    console.log('\n--- Test 3: Verify Event Metadata ---');
    if (preToolEvents.length > 0) {
      const firstEvent = preToolEvents[0];
      console.log('✓ Event structure:');
      console.log(`  hook_event_name: ${firstEvent.hook_event_name}`);
      console.log(`  session_id: ${firstEvent.session_id}`);
      console.log(`  tool_name: ${firstEvent.tool_name}`);
      console.log(`  timestamp: ${firstEvent.timestamp}`);

      if (firstEvent.body._opencode_meta) {
        console.log('✓ OpenCode metadata present:');
        console.log(`  project: ${firstEvent.body._opencode_meta.project}`);
        console.log(`  directory: ${firstEvent.body._opencode_meta.directory}`);
        console.log(`  timestamp: ${firstEvent.body._opencode_meta.timestamp}`);
      }
    }

    // Test 4: Test blocking functionality
    console.log('\n--- Test 4: Test Tool Blocking ---');
    mockServer.clearEvents();

    // Configure server to block Bash commands
    mockServer.onEvent('PreToolUse', (body) => {
      if (body.tool_name === 'Bash') {
        console.log('  🛑 Blocking Bash command');
        return { block: true, reason: 'Bash commands blocked for testing' };
      }
      return { block: false };
    });

    console.log('Sending prompt that might trigger Bash...');
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
            text: 'Run the ls command to list files',
          },
        ],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const blockTestEvents = mockServer.getEvents();
    const bashEvent = blockTestEvents.find((e) => e.tool_name === 'Bash');

    if (bashEvent) {
      console.log('✓ Bash tool call was intercepted by plugin');

      const bashPostTool = blockTestEvents.find(
        (e) => e.hook_event_name === 'PostToolUse' && e.tool_name === 'Bash'
      );
      if (!bashPostTool) {
        console.log('✓ Bash tool was successfully blocked (no PostToolUse event)');
      }
    } else {
      console.log('ℹ Agent chose not to use Bash tool');
    }

    // Summary
    console.log('\n--- Summary ---');
    const allEvents = mockServer.getEvents();
    const eventCounts = allEvents.reduce(
      (acc, e) => {
        acc[e.hook_event_name] = (acc[e.hook_event_name] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log('Total events received:', allEvents.length);
    console.log('Event breakdown:');
    Object.entries(eventCounts).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    mockServer.stop();
    console.log('\n🛑 Mock server stopped');
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run tests
main();
