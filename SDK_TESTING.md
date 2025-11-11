# Testing Your Plugin with OpenCode SDK

## Summary

**Yes! You can now test your plugin using the real OpenCode SDK.** We've created comprehensive SDK integration tests that work with a running OpenCode server.

## What We've Built

### 1. Real SDK Integration Tests
**File**: `test/integration/real-sdk-integration.test.ts`

These tests use the actual OpenCode SDK to:
- Create sessions
- Send prompts that trigger tool calls
- Monitor plugin events in real-time
- Test tool blocking and control

### 2. Standalone CLI Test Script
**File**: `test/cli-test.ts`

A complete test script that demonstrates:
- Session creation
- Tool execution monitoring
- Event verification
- Tool blocking functionality

## How It Works

```
┌─────────────────┐
│  Your Test      │
│  Script/Suite   │
└────────┬────────┘
         │ Uses SDK
         ▼
┌─────────────────┐         Loads Plugin          ┌──────────────────┐
│  OpenCode       │  ──────────────────────────>  │  agent-monitor   │
│  Server         │                                │  Plugin          │
│  (port 3456)    │                                └────────┬─────────┘
└─────────────────┘                                         │
                                                           │ HTTP POST
                                                           ▼
                                                   ┌──────────────────┐
                                                   │  Mock Server     │
                                                   │  (port 37123)    │
                                                   └──────────────────┘
                                                            │
                                                            │ Records
                                                            ▼
                                                    [ Plugin Events ]
```

## Prerequisites

1. **Install Plugin**
   ```bash
   npm run install-plugin
   ```

2. **Start OpenCode Server**
   ```bash
   opencode serve --port 3456 --print-logs
   ```

   Keep this running in a separate terminal.

3. **Verify Plugin Loaded**
   Look for this in the OpenCode server output:
   ```
   [Agent Monitor] Plugin loaded, will send events to: http://localhost:37123/agent-monitor
   ```

## Running the Tests

### Method 1: Standalone CLI Test (Recommended)

```bash
# Terminal 1: Start OpenCode server
opencode serve --port 3456 --print-logs

# Terminal 2: Run the test
OPENCODE_SERVER_URL=http://localhost:3456 bun test/cli-test.ts
```

Expected output:
```
🧪 OpenCode Plugin CLI Test

📡 Starting mock server on port 37123...
✓ Mock server started

🔗 Connecting to OpenCode server at http://localhost:3456...

--- Test 1: Create Session ---
✓ Session created: session-xxx
✓ Plugin sent SessionStart event

--- Test 2: Execute Prompt with Tool Calls ---
Sending prompt: "Read the package.json file"...
Waiting for tool events...
✓ Received 4 events from plugin
  - PreToolUse events: 2
  - PostToolUse events: 2

  Tools called:
    1. Read
    2. Grep

--- Test 3: Verify Event Metadata ---
✓ Event structure verified
✓ OpenCode metadata present

--- Test 4: Test Tool Blocking ---
✓ Bash tool call was intercepted
✓ Bash tool was successfully blocked

--- Summary ---
Total events received: 8
Event breakdown:
  - PreToolUse: 3
  - PostToolUse: 2
  - SessionStart: 1
  - Notification: 2

✅ All tests completed successfully!
```

### Method 2: Bun Test Suite

```bash
# Terminal 1: Start OpenCode server
opencode serve --port 3456 --print-logs

# Terminal 2: Run integration tests
OPENCODE_SERVER_URL=http://localhost:3456 bun test test/integration/real-sdk-integration.test.ts
```

## What the Tests Do

### 1. Session Management
```typescript
const client = new OpencodeClient({ baseUrl: 'http://localhost:3456' });

// Create session - triggers SessionStart event
const session = await client.session.create({
  body: { title: 'Test Session' }
});

// Plugin automatically sends SessionStart to mock server
```

### 2. Tool Execution Monitoring
```typescript
// Send prompt that triggers tools
await client.session.prompt({
  path: { id: sessionId },
  body: {
    model: {
      providerID: 'anthropic',
      modelID: 'claude-3-5-sonnet-20241022'
    },
    parts: [
      { type: 'text', text: 'Read the package.json file' }
    ]
  }
});

// Plugin sends PreToolUse → PostToolUse events
// Mock server records them all
```

### 3. Tool Blocking
```typescript
// Configure mock server to block specific tools
mockServer.onEvent('PreToolUse', (body) => {
  if (body.tool_name === 'Bash') {
    return { block: true, reason: 'Blocked for testing' };
  }
  return { block: false };
});

// Try to execute bash command
await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: 'text', text: 'Run ls command' }]
  }
});

// Plugin receives block response and prevents execution
```

### 4. Event Verification
```typescript
// Get all events from mock server
const events = mockServer.getEvents();

// Filter by type
const preToolEvents = mockServer.getEventsByType('PreToolUse');

// Check event structure
expect(preToolEvents[0].hook_event_name).toBe('PreToolUse');
expect(preToolEvents[0].tool_name).toBeTruthy();
expect(preToolEvents[0].body._opencode_meta).toBeDefined();
```

## Available Test Functions

### Creating a Test

```typescript
import { OpencodeClient } from '@opencode-ai/sdk';
import { MockAgentMonitorServer } from './helpers/mock-server';

async function testPlugin() {
  // 1. Start mock server
  const mockServer = new MockAgentMonitorServer({ autoRespond: true });
  await mockServer.start(37123);

  // 2. Create SDK client
  const client = new OpencodeClient({
    baseUrl: 'http://localhost:3456'
  });

  // 3. Create session
  const session = await client.session.create({
    body: { title: 'My Test' }
  });

  // 4. Execute operations
  await client.session.prompt({
    path: { id: session.data.id },
    body: {
      model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' },
      parts: [{ type: 'text', text: 'Test prompt' }]
    }
  });

  // 5. Verify events
  const events = mockServer.getEvents();
  console.log(`Received ${events.length} events`);

  // 6. Cleanup
  mockServer.stop();
}
```

## SDK Methods Available

### Session Management
```typescript
// Create session
await client.session.create({ body: { title: 'Session Title' } });

// Send prompt
await client.session.prompt({
  path: { id: sessionId },
  body: {
    model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' },
    parts: [{ type: 'text', text: 'Your prompt' }]
  }
});

// Run command
await client.session.command({
  path: { id: sessionId },
  body: { /* command details */ }
});

// List sessions
await client.session.list();

// Get session
await client.session.get({ path: { id: sessionId } });
```

### File Operations
```typescript
// Read file
await client.file.read({ query: { path: 'package.json' } });

// Find files
await client.find.files({ query: { query: '*.ts' } });

// Search text
await client.find.text({ query: { pattern: 'function.*test' } });
```

### Event Subscription
```typescript
// Subscribe to OpenCode events
const eventsResponse = await client.event.subscribe();

for await (const event of eventsResponse.stream) {
  console.log('Event:', event.type);
}
```

## Test Scenarios

### Test 1: Basic Plugin Functionality
```bash
bun test/cli-test.ts
```
- ✓ SessionStart event sent
- ✓ PreToolUse events sent
- ✓ PostToolUse events sent
- ✓ Metadata included

### Test 2: Tool Blocking
Configure mock server to block tools, verify they're blocked.

### Test 3: Multiple Tool Calls
Send prompt that triggers multiple tools, verify all events.

### Test 4: Session Lifecycle
Create session, execute tools, verify session events.

### Test 5: Concurrent Sessions
Create multiple sessions, verify events are isolated.

## Troubleshooting

### "Connection refused" Error
**Problem**: SDK can't connect to OpenCode server

**Solutions**:
1. Ensure OpenCode server is running:
   ```bash
   opencode serve --port 3456 --print-logs
   ```

2. Check the port in server output:
   ```
   opencode server listening on http://127.0.0.1:3456
   ```

3. Set correct URL:
   ```bash
   OPENCODE_SERVER_URL=http://localhost:3456 bun test/cli-test.ts
   ```

### Plugin Not Loading
**Problem**: Plugin doesn't send events

**Solutions**:
1. Reinstall plugin:
   ```bash
   npm run install-plugin
   ```

2. Check OpenCode server logs for:
   ```
   [Agent Monitor] Plugin loaded
   ```

3. Verify plugin file exists:
   ```bash
   ls ~/.opencode/plugins/agent-monitor
   ```

### No Events Received
**Problem**: Mock server doesn't receive events

**Solutions**:
1. Check mock server is running on port 37123
2. Verify plugin is sending to correct port (check plugin logs)
3. Add delay after operations:
   ```typescript
   await client.session.prompt(...);
   await new Promise(resolve => setTimeout(resolve, 2000));
   const events = mockServer.getEvents();
   ```

### SDK Version Mismatch
**Problem**: Import errors or type errors

**Solution**:
```bash
npm install @opencode-ai/sdk@latest
```

## Example: Complete Test Script

```typescript
#!/usr/bin/env bun
import { OpencodeClient } from '@opencode-ai/sdk';
import { MockAgentMonitorServer } from './helpers/mock-server';

async function runTest() {
  // Setup
  const mockServer = new MockAgentMonitorServer({ autoRespond: true });
  await mockServer.start(37123);

  const client = new OpencodeClient({
    baseUrl: 'http://localhost:3456'
  });

  try {
    // Test: Create session and execute prompt
    console.log('Creating session...');
    const session = await client.session.create({
      body: { title: 'Test Session' }
    });

    console.log('Sending prompt...');
    await client.session.prompt({
      path: { id: session.data.id },
      body: {
        model: {
          providerID: 'anthropic',
          modelID: 'claude-3-5-sonnet-20241022'
        },
        parts: [{
          type: 'text',
          text: 'Read the README.md file'
        }]
      }
    });

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify
    const events = mockServer.getEvents();
    console.log(`✓ Received ${events.length} events`);

    events.forEach((event, i) => {
      console.log(`  ${i + 1}. ${event.hook_event_name} - ${event.tool_name || 'N/A'}`);
    });

    console.log('✅ Test passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mockServer.stop();
  }
}

runTest();
```

Run it:
```bash
chmod +x my-test.ts
OPENCODE_SERVER_URL=http://localhost:3456 bun my-test.ts
```

## Next Steps

1. **Run the standalone test**:
   ```bash
   # Terminal 1
   opencode serve --port 3456 --print-logs

   # Terminal 2
   bun test/cli-test.ts
   ```

2. **Create your own tests** using the patterns in `test/integration/real-sdk-integration.test.ts`

3. **Integrate into CI/CD**: Start OpenCode server in CI, run tests, verify plugin behavior

## Files Created

- `test/integration/real-sdk-integration.test.ts` - Full test suite
- `test/cli-test.ts` - Standalone test script
- `test/helpers/mock-server.ts` - Mock HTTP server

## Summary

✅ **Real OpenCode SDK integration** - Tests use actual SDK
✅ **Running OpenCode server** - Tests against real server
✅ **Plugin auto-loads** - No manual intervention needed
✅ **Event verification** - Mock server records all events
✅ **Tool control** - Can block/allow tools dynamically
✅ **Comprehensive coverage** - Sessions, tools, lifecycle, metadata

**Start testing**: `bun test/cli-test.ts`
