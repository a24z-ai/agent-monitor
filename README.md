# Agent Monitor - OpenCode Plugin

A plugin for OpenCode that monitors and controls agent tool calls by sending events to a VSCode extension.

## Installation

### Quick Install (Global)
```bash
cd agent-monitor
node install.js
```

Or using npm scripts:
```bash
npm run install-plugin
```

### Project-specific Install
```bash
node install.js install --local
# or
npm run install-local
```

## Uninstall
```bash
node install.js uninstall
# or
npm run uninstall-plugin
```

## How it Works

The plugin intercepts all tool calls in OpenCode and:

1. **Sends events** to `http://localhost:37123/agent-monitor`
2. **Blocks execution** if the monitor service is unreachable
3. **Allows/blocks tools** based on the monitor service response

## Monitor Service Response Format

The monitor service should respond to POST requests with:

```json
{
  "block": false,  // false to allow, true to block
  "reason": "Optional reason for blocking"
}
```

## Events Sent

### `tool.pre_execute`
Sent before a tool executes. Includes:
- Tool name
- Session ID
- Call ID
- Sanitized arguments
- Session statistics

### `tool.post_execute`
Sent after successful execution.

### `session.started`
Sent when a new session begins.

### `session.idle`
Sent when a session becomes idle with final statistics.

### `session.error`
Sent when a session encounters an error.

## Requirements

- OpenCode CLI
- A service listening on port 37123 (e.g., VSCode extension)

## Development

The plugin source is in `src/opencode/http-sender.js`. After making changes, run the install script again to update the installed plugin.