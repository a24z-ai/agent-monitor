# Agent Monitor - OpenCode Plugin

A plugin for OpenCode that monitors and controls agent tool calls by sending events to a VSCode extension. Now with **Claude hooks alignment** for comprehensive agent monitoring.

## Features

### 🎯 Claude Event Alignment
- Full compatibility with Claude's hook system
- Maps OpenCode events to Claude hook format
- Supports all 9 Claude hook event types

### 🛠️ Comprehensive Tool Registry
- Tracks all 17 Claude tools
- Tool categorization (File ops, Search, Web, Shell, etc.)
- Sensitivity-based input sanitization
- Includes new tools: `BashOutput`, `KillShell`

### 📊 Enhanced Event Structure
- Claude-compatible event payloads
- Includes `session_id`, `transcript_path`, `cwd`
- OpenCode metadata preserved
- Real-time session lifecycle tracking

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

1. **Sends Claude-formatted events** to `http://localhost:37123/agent-monitor`
2. **Blocks execution** if the monitor service is unreachable
3. **Allows/blocks tools** based on the monitor service response
4. **Sanitizes sensitive data** based on tool type
5. **Tracks session lifecycle** with SessionStart/SessionEnd events

## Claude-Aligned Event Types

### Tool Events
- `PreToolUse` - Before tool execution (maps from `tool.execute.before`)
- `PostToolUse` - After tool completion (maps from `tool.execute.after`)

### Session Events
- `SessionStart` - When session begins (source: startup/resume/clear)
- `SessionEnd` - When session terminates (reason: idle/error)

### Future Support (Roadmap)
- `UserPromptSubmit` - When user submits prompts
- `Notification` - System notifications
- `Stop` / `SubagentStop` - Agent completion events
- `PreCompact` - Context compaction events

## Monitor Service Response Format

The monitor service should respond to POST requests with:

```json
{
  "block": false,          // false to allow, true to block
  "reason": "Optional reason for blocking",
  "context": "Optional context to inject"
}
```

## Event Payload Structure

All events follow Claude's structure:

```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "test-session-123",
  "transcript_path": "/path/to/transcript.json",
  "cwd": "/current/working/directory",
  "tool_name": "Bash",
  "tool_input": {
    // Sanitized based on tool sensitivity
  },
  "_opencode_meta": {
    "project": "project-name",
    "directory": "/project/path",
    "worktree": "/worktree/path",
    "timestamp": 1234567890
  }
}
```

## Tool Categories

### Supported Tools by Category

**File Operations**: Read, Write, Edit, MultiEdit
**Search**: Glob, Grep, LS
**Shell**: Bash, BashOutput, KillShell
**Web**: WebFetch, WebSearch
**Notebooks**: NotebookRead, NotebookEdit
**Task Management**: TodoWrite
**Subagents**: Task
**Planning**: ExitPlanMode

## Requirements

- OpenCode CLI v0.6.4+
- Node.js 18+
- A service listening on port 37123 (e.g., VSCode extension)

## Development

### Project Structure
```
src/
├── opencode/
│   ├── http-sender.ts         # Original plugin
│   └── claude-aligned-sender.ts # Claude-aligned version
├── types/
│   └── claude-events.ts       # Claude event type definitions
└── constants/
    └── tools.ts               # Tool registry and metadata
```

### Testing
```bash
npm test              # Run tests
npm run lint          # Check linting
npm run typecheck     # TypeScript validation
```

### Design Documentation
See [CLAUDE_ALIGNMENT_DESIGN.md](docs/CLAUDE_ALIGNMENT_DESIGN.md) for the complete alignment roadmap.

## Roadmap

- [x] Milestone 1: Core Event Mapping
- [ ] Milestone 2: Session Lifecycle Events
- [ ] Milestone 3: User Interaction Events
- [ ] Milestone 4: Advanced Features
- [ ] Milestone 5: Testing & Documentation

## License

MIT