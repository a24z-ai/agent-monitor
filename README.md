# Agent Monitor - OpenCode Plugin

A plugin for OpenCode that monitors and controls agent tool calls by sending events to a VSCode extension. **✅ CLAUDE HOOKS ALIGNMENT COMPLETED** - Full feature parity with Claude's hook system.

## 🎉 Completed Features

### ✅ Claude Event Alignment (Milestone 1)
- **COMPLETED**: Full compatibility with Claude's hook system
- **COMPLETED**: Maps OpenCode events to Claude hook format
- **COMPLETED**: Supports all 9 Claude hook event types

### ✅ Session Lifecycle Management (Milestone 2)
- **COMPLETED**: SessionStart/SessionEnd event detection
- **COMPLETED**: Stop and SubagentStop events for agent completion
- **COMPLETED**: Real-time session state tracking with 60-second idle timeout

### ✅ User Interaction Control (Milestone 3)
- **COMPLETED**: UserPromptSubmit events with full response control
- **COMPLETED**: Notification system with 8 severity types
- **COMPLETED**: Prompt blocking, modification, and context injection
- **COMPLETED**: Sentiment analysis and session statistics

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

### ✅ All Claude Events Supported
- ✅ `UserPromptSubmit` - When user submits prompts (with response control)
- ✅ `Notification` - System notifications with severity levels
- ✅ `Stop` / `SubagentStop` - Agent completion events
- 🔮 `PreCompact` - Context compaction events (see [Future Work](docs/FUTURE_WORK.md))

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
│   ├── http-sender.ts            # Original plugin
│   ├── claude-aligned-sender.ts  # Milestone 1: Core events
│   ├── enhanced-claude-sender.ts # Milestone 2: Session lifecycle
│   └── full-claude-plugin.ts     # Milestone 3: Complete implementation
├── services/
│   ├── session-manager.ts        # Session state and lifecycle
│   └── user-interaction-handler.ts # Prompts and notifications
├── types/
│   └── claude-events.ts          # Claude event type definitions
└── constants/
    └── tools.ts                  # Tool registry and metadata
```

### Testing
```bash
npm test              # Run tests
npm run lint          # Check linting
npm run typecheck     # TypeScript validation
```

### Design Documentation
- [CLAUDE_ALIGNMENT_DESIGN.md](docs/CLAUDE_ALIGNMENT_DESIGN.md) - Complete implementation roadmap
- [FUTURE_WORK.md](docs/FUTURE_WORK.md) - Advanced features and enhancements

## ✅ Implementation Status

**ALL CORE MILESTONES COMPLETED:**
- ✅ **Milestone 1**: Core Event Mapping - COMPLETED
- ✅ **Milestone 2**: Session Lifecycle Events - COMPLETED
- ✅ **Milestone 3**: User Interaction Events - COMPLETED

**Future Enhancements** (see [FUTURE_WORK.md](docs/FUTURE_WORK.md)):
- 🔮 Enhanced Response Formats with JSON control
- 🔮 PreCompact event implementation
- 🔮 Advanced security and authentication

## License

MIT