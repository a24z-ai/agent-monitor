# Agent Monitor VSCode Extension API Specification

## Overview
The Agent Monitor OpenCode plugin sends HTTP requests to a VSCode extension to monitor and control AI agent tool calls. The extension must implement an HTTP server listening on port **37123**.

## Endpoint

### POST `/agent-monitor`
**Port:** 37123  
**Host:** localhost  
**Content-Type:** application/json

## Request Format

All requests include these base fields:
```typescript
interface BaseEvent {
  type: string;          // Event type (see Event Types below)
  timestamp: number;     // Unix timestamp in milliseconds
  project: string;       // Project name or "unknown"
  directory: string;     // Working directory path
  worktree: string;      // Git worktree path
}
```

## Event Types

### 1. `session.started`
Sent when a new AI session begins.

```json
{
  "type": "session.started",
  "timestamp": 1703123456789,
  "project": "my-project",
  "directory": "/Users/john/projects/my-project",
  "worktree": "/Users/john/projects/my-project",
  "sessionID": "session_abc123",
  "startTime": 1703123456789
}
```

### 2. `tool.pre_execute` ⚠️ **BLOCKING**
Sent before a tool executes. **The response determines if the tool is allowed to run.**

```json
{
  "type": "tool.pre_execute",
  "timestamp": 1703123456789,
  "project": "my-project",
  "directory": "/Users/john/projects/my-project",
  "worktree": "/Users/john/projects/my-project",
  "tool": "bash",
  "sessionID": "session_abc123",
  "callID": "call_xyz789",
  "args": {
    "command": "rm -rf /important",  // First 100 chars for bash commands
    "filePath": "/path/to/file.js",  // For file operations
    "pattern": "TODO",               // For search operations
    // Other args will show type only: "string", "number", "boolean", "object"
  },
  "sessionStats": {
    "toolCallCount": 5,
    "uniqueTools": 3,
    "duration": 45000  // milliseconds since session start
  }
}
```

### 3. `tool.post_execute`
Sent after successful tool execution (non-blocking).

```json
{
  "type": "tool.post_execute",
  "timestamp": 1703123456789,
  "project": "my-project",
  "directory": "/Users/john/projects/my-project",
  "worktree": "/Users/john/projects/my-project",
  "tool": "bash",
  "sessionID": "session_abc123",
  "callID": "call_xyz789",
  "title": "Running command: ls -la",
  "outputLength": 2048,
  "hasMetadata": true
}
```

### 4. `session.idle`
Sent when a session becomes idle.

```json
{
  "type": "session.idle",
  "timestamp": 1703123456789,
  "project": "my-project",
  "directory": "/Users/john/projects/my-project",
  "worktree": "/Users/john/projects/my-project",
  "sessionID": "session_abc123",
  "finalStats": {
    "duration": 120000,
    "totalToolCalls": 15,
    "uniqueTools": ["bash", "read", "write", "edit"]
  }
}
```

### 5. `session.error`
Sent when a session encounters an error.

```json
{
  "type": "session.error",
  "timestamp": 1703123456789,
  "project": "my-project",
  "directory": "/Users/john/projects/my-project",
  "worktree": "/Users/john/projects/my-project",
  "sessionID": "session_abc123",
  "error": "ProviderAuthError"
}
```

## Response Format

### For `tool.pre_execute` (REQUIRED)

The extension **MUST** respond with a JSON object:

#### Allow execution:
```json
{
  "block": false
}
```

#### Block execution:
```json
{
  "block": true,
  "reason": "This operation is not allowed in production directories"
}
```

### For all other events
Response is optional. Any 2xx status code is considered success.

## Error Handling

1. **Connection Failed**: If the extension's HTTP server is not reachable, ALL tool calls will be **BLOCKED**.
2. **Invalid Response**: If the response to `tool.pre_execute` is not valid JSON or missing the `block` field, the tool will be **BLOCKED**.
3. **Timeout**: The plugin waits for a response. Long response times will delay tool execution.
4. **Non-2xx Status**: Any non-2xx HTTP status code will result in the tool being **BLOCKED**.

## Implementation Example (VSCode Extension)

```typescript
import * as vscode from 'vscode';
import * as http from 'http';

export function activate(context: vscode.ExtensionContext) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/agent-monitor') {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const event = JSON.parse(body);
          
          // Log the event
          console.log('Agent Monitor Event:', event.type, event);
          
          // Handle tool.pre_execute - decide whether to block
          if (event.type === 'tool.pre_execute') {
            const shouldBlock = await checkIfShouldBlock(event);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              block: shouldBlock,
              reason: shouldBlock ? 'Dangerous operation detected' : undefined
            }));
          } else {
            // For non-blocking events, just acknowledge
            res.writeHead(200);
            res.end('OK');
          }
        } catch (error) {
          res.writeHead(400);
          res.end('Bad Request');
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  server.listen(37123, 'localhost', () => {
    console.log('Agent Monitor server listening on http://localhost:37123');
  });
  
  context.subscriptions.push({
    dispose: () => server.close()
  });
}

async function checkIfShouldBlock(event: any): Promise<boolean> {
  // Example blocking logic
  if (event.tool === 'bash' && event.args.command?.includes('rm -rf')) {
    return true; // Block dangerous commands
  }
  
  if (event.sessionStats.toolCallCount > 100) {
    return true; // Block if too many tool calls
  }
  
  return false; // Allow by default
}
```

## Testing

To test the integration:

1. Start your VSCode extension with the HTTP server
2. Install the OpenCode plugin: `node install.js` in the agent-monitor directory
3. Use OpenCode normally - you should see events in your extension's console
4. Test blocking by implementing logic to return `{block: true}` for certain conditions

## Security Considerations

1. The server only listens on localhost to prevent external access
2. Sensitive data in tool arguments is sanitized or omitted
3. Full command/file contents are truncated to prevent leaking secrets
4. The plugin fails-closed: if monitoring fails, tools are blocked

## Common Tool Names to Monitor

- `bash` - Shell command execution
- `read` - File reading
- `write` - File writing
- `edit` - File editing
- `grep` - File searching
- `glob` - File pattern matching
- `webfetch` - Web requests
- `mcp__*` - MCP server tools (e.g., `mcp__memory__askMemory`)