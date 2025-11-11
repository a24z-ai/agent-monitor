# Agent Monitor Testing Suite

Comprehensive testing for the OpenCode agent monitor plugin with automatic OpenCode server management.

## Quick Start

```bash
# Run all tests (auto-manages OpenCode server)
bun test

# Run unit tests only (no OpenCode server required)
SKIP_INTEGRATION=true bun test

# Run with manual OpenCode server
opencode serve --port 3456 --print-logs  # Terminal 1
OPENCODE_SERVER_URL=http://localhost:3456 bun test  # Terminal 2
```

## Test Structure

```
test/
├── setup.ts                        # Global test setup (manages OpenCode server)
├── helpers/
│   ├── mock-server.ts              # Mock HTTP server for testing
│   └── opencode-server.ts          # OpenCode server manager (NEW)
├── integration/
│   ├── real-sdk-integration.test.ts # Real SDK integration tests
│   ├── sdk-integration.test.ts     # OpenCode SDK integration tests
│   └── mock-server.test.ts         # Real plugin + mock server tests
├── enhanced/
│   └── advanced-scenarios.test.ts  # Edge cases and advanced scenarios
├── plugin.test.js                  # Original unit tests
├── session-lifecycle.test.js       # Session lifecycle tests
├── user-interaction.test.js        # User interaction tests
└── http-server.test.js             # HTTP server tests
```

## Running Tests

### Automatic Mode (Recommended)
The test framework automatically starts and manages OpenCode server:

```bash
# Prerequisites: opencode CLI must be installed
bun test
```

### Manual Mode
If you prefer to control the OpenCode server:

```bash
# Terminal 1: Start OpenCode server
opencode serve --port 3456 --print-logs

# Terminal 2: Run tests
OPENCODE_SERVER_URL=http://localhost:3456 bun test
```

### Skip Integration Tests
For faster testing or when OpenCode is unavailable:

```bash
SKIP_INTEGRATION=true bun test
```

### Run Specific Test Suites
```bash
# Unit tests only
bun test test/plugin.test.js

# Integration tests
bun test test/integration/

# Advanced scenarios
bun test test/enhanced/

# Mock server tests
bun test test/integration/mock-server.test.ts
```

### Watch Mode
```bash
npm run test:watch
# or
bun test --watch
```

## Test Categories

### 1. Unit Tests (test/*.test.js)
- Basic plugin functionality
- Event sending and receiving
- Tool blocking/allowing
- Session tracking
- User interaction handling

**Location**: `test/plugin.test.js`, `test/session-lifecycle.test.js`, `test/user-interaction.test.js`

### 2. Integration Tests (test/integration/)
- Real plugin with mock HTTP server
- OpenCode SDK integration (requires OpenCode setup)
- Full request/response cycle
- Multi-session handling
- Performance testing

**Location**: `test/integration/sdk-integration.test.ts`, `test/integration/mock-server.test.ts`

### 3. Advanced Scenarios (test/enhanced/)
- Concurrent operations
- Error handling and edge cases
- Data sanitization
- Response control (blocking, modification, context injection)
- Session lifecycle management
- Notification system
- Performance testing

**Location**: `test/enhanced/advanced-scenarios.test.ts`

## Mock HTTP Server

The `MockAgentMonitorServer` provides a real HTTP server for testing:

### Basic Usage
```typescript
import { MockAgentMonitorServer } from './helpers/mock-server';

const server = new MockAgentMonitorServer({
  autoRespond: true,
  defaultResponse: { block: false }
});

await server.start(37123);

// Run your tests...

server.stop();
```

### Features
- ✅ Records all received events
- ✅ Configurable responses (queue, default, custom handlers)
- ✅ Event filtering by type, session, etc.
- ✅ Async event waiting
- ✅ Custom event handlers

### Example: Custom Response Handler
```typescript
server.onEvent('PreToolUse', (body) => {
  if (body.tool_name === 'Bash' && body.tool_input.command.includes('rm')) {
    return { block: true, reason: 'Dangerous command detected' };
  }
  return { block: false };
});
```

### Example: Queued Responses
```typescript
// Queue specific responses for next requests
server.queueResponses([
  { block: false },                    // SessionStart
  { block: true, reason: 'Blocked' },  // PreToolUse
]);
```

### Example: Wait for Events
```typescript
// Wait for specific event
const event = await server.waitForEvent('SessionStart', 3000);

// Wait for multiple events
const events = await server.waitForEvents(5, 5000);

// Get events by type
const preToolEvents = server.getEventsByType('PreToolUse');

// Get events by session
const sessionEvents = server.getSessionEvents('session-123');
```

## Testing with OpenCode SDK

### Prerequisites
1. Install dependencies: `npm install`
2. Ensure OpenCode is installed and accessible
3. Plugin should be installed globally or locally

### SDK Integration Tests
The SDK integration tests (`test/integration/sdk-integration.test.ts`) test the plugin in a real OpenCode environment.

**Note**: Some tests may require a running OpenCode server. Check the test file for specific setup requirements.

### Example: Testing Tool Execution
```typescript
import { OpenCodeClient } from '@opencode-ai/sdk';

const client = new OpenCodeClient();
const mockServer = new MockAgentMonitorServer();
await mockServer.start(37123);

// Create session and execute tools
// The plugin will automatically send events to mockServer

const events = mockServer.getEvents();
expect(events.length).toBeGreaterThan(0);
```

## Test Coverage

### Event Types Tested
- ✅ SessionStart
- ✅ SessionEnd
- ✅ PreToolUse
- ✅ PostToolUse
- ✅ UserPromptSubmit
- ✅ Notification
- ✅ Stop
- ✅ SubagentStop

### Functionality Tested
- ✅ Event sending and structure
- ✅ Tool blocking/allowing
- ✅ Prompt modification
- ✅ Context injection
- ✅ Session lifecycle tracking
- ✅ Multi-session handling
- ✅ Concurrent operations
- ✅ Error handling
- ✅ Data sanitization
- ✅ Performance under load
- ✅ Network error handling
- ✅ Malformed response handling

### Tools Tested
- ✅ Bash
- ✅ Read
- ✅ Write
- ✅ Edit
- ✅ Grep
- ✅ Glob
- ✅ Task (subagent)
- And more...

## Writing New Tests

### Unit Test Template
```typescript
import { test, expect, beforeEach } from 'bun:test';

test('description of what is being tested', async () => {
  // Setup
  const mockServer = new MockAgentMonitorServer();
  await mockServer.start();

  // Execute
  // ... your test code

  // Assert
  expect(result).toBe(expected);

  // Cleanup
  mockServer.stop();
});
```

### Integration Test Template
```typescript
import { test, expect, beforeAll, afterAll } from 'bun:test';

describe('Feature Name', () => {
  let mockServer, plugin;

  beforeAll(async () => {
    mockServer = new MockAgentMonitorServer();
    await mockServer.start(37123);

    const pluginModule = await import('../src/opencode/full-claude-plugin.ts');
    plugin = await pluginModule.FullClaudeMonitorPlugin({
      project: { name: 'test' },
      directory: '/test',
      worktree: '/test'
    });
  });

  afterAll(() => {
    mockServer.stop();
  });

  test('specific functionality', async () => {
    // Test code...
  });
});
```

## Debugging Tests

### Enable Verbose Logging
The plugin and mock server log to console. Check output for:
- `[Agent Monitor]` - Plugin messages
- `[MockServer]` - Mock server messages
- `[Test]` - Test-specific messages

### Inspect Events
```typescript
// Get all events
console.log(mockServer.getEvents());

// Get last event
console.log(mockServer.getLastEvent());

// Get events by type
console.log(mockServer.getEventsByType('PreToolUse'));
```

### Common Issues
1. **Server not responding**: Ensure mock server is started before plugin initialization
2. **Events not received**: Check that the port (37123) is correct
3. **Timeout errors**: Increase timeout values for slow operations
4. **Race conditions**: Use `waitForEvent()` instead of fixed timeouts

## Performance Benchmarks

Expected performance (on typical hardware):
- Single tool call: < 50ms overhead
- 50 concurrent tool calls: < 5 seconds total
- 100 sessions: Handles without issues
- Event recording: Minimal memory footprint

Run performance tests:
```bash
bun test test/enhanced/advanced-scenarios.test.ts --grep Performance
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
```

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all existing tests pass
3. Add integration tests for new event types
4. Update this README with new test categories

## Resources

- [OpenCode SDK Documentation](https://opencode.ai/docs/sdk/)
- [Bun Test Documentation](https://bun.sh/docs/cli/test)
- [Plugin Development Guide](../docs/CLAUDE_ALIGNMENT_DESIGN.md)
