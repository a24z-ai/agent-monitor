# Claude Hooks Alignment Design Document

## Overview
This document outlines the changes needed to align the agent-monitor OpenCode plugin with Claude's hook system to achieve feature parity and ensure comprehensive agent monitoring capabilities.

## Current State
The agent-monitor plugin currently implements basic tool monitoring through OpenCode's plugin system, capturing tool execution events and session lifecycle. However, it lacks several key event types that Claude supports.

## Goal
Achieve comprehensive alignment with Claude's hook system while maintaining OpenCode plugin compatibility, enabling full visibility into agent behavior across both platforms.

## Milestones

### Milestone 1: Core Event Mapping ✅ COMPLETED
**Goal:** Map existing OpenCode events to Claude hook event names and structure

#### Tasks
1. **Update Event Type System**
   - Change from dot notation (`tool.pre_execute`) to Claude's naming (`PreToolUse`)
   - Create event type enum matching Claude's `hook_event_name` values
   - Add type definitions for all Claude hook events

2. **Enhance Payload Structure**
   - Add `cwd` (current working directory) to all events
   - Add `transcript_path` for session tracking
   - Standardize `hook_event_name` field across all events
   - Ensure `session_id` consistency

3. **Update Tool Registry**
   - Add missing tools: `BashOutput`, `KillShell`
   - Create comprehensive tool name constants
   - Add tool categorization (file ops, search, web, notebook, etc.)

#### Deliverables
- ✅ `src/types/claude-events.ts` - Complete type definitions
- ✅ `src/constants/tools.ts` - Tool registry with categories
- ✅ `src/opencode/claude-aligned-sender.ts` - Claude-aligned plugin implementation

---

### Milestone 2: Session Lifecycle Events
**Goal:** Implement proper session lifecycle tracking matching Claude's model

#### Tasks
1. **Implement SessionStart Event**
   - Detect session initialization sources (`startup`, `resume`, `clear`)
   - Track session metadata
   - Replace custom `session.started` event

2. **Implement SessionEnd Event**
   - Capture termination reasons
   - Clean up session resources
   - Send final session statistics

3. **Add Stop Hooks**
   - Implement `Stop` event for main agent completion
   - Implement `SubagentStop` for Task tool completion
   - Track `stop_hook_active` status

#### Deliverables
- Session lifecycle manager module
- Stop event detection and handling
- Session state persistence

---

### Milestone 3: User Interaction Events
**Goal:** Capture user-initiated events and system notifications

#### Tasks
1. **Implement UserPromptSubmit**
   - Detect when user submits prompts
   - Capture prompt content (with sanitization options)
   - Enable prompt blocking/modification capability

2. **Implement Notification Events**
   - Capture system notifications
   - Track notification messages
   - Support notification filtering

3. **Response Control System**
   - Implement blocking with reasons
   - Support context injection
   - Add system message capabilities

#### Deliverables
- User interaction event handlers
- Notification capture system
- Response control interface

---

### Milestone 4: Advanced Features
**Goal:** Implement context management and enhanced monitoring

#### Tasks
1. **Implement PreCompact Event**
   - Detect context compaction triggers (`manual`, `auto`)
   - Capture custom instructions
   - Enable compaction control

2. **Enhanced Response Formats**
   - Support JSON response with decision control
   - Implement output suppression
   - Add context injection for Claude

3. **Background Process Monitoring**
   - Track `BashOutput` tool usage
   - Monitor `KillShell` operations
   - Implement background shell tracking

#### Deliverables
- Context management module
- Enhanced response handler
- Background process tracker

---

### Milestone 5: Testing & Documentation
**Goal:** Comprehensive testing and documentation for the aligned system

#### Tasks
1. **Test Infrastructure**
   - Create mock Claude environment
   - Build event simulation system
   - Implement validation tests for all event types

2. **Integration Tests**
   - Test OpenCode plugin compatibility
   - Verify Claude hook alignment
   - Performance and reliability testing

3. **Documentation**
   - API documentation for all events
   - Migration guide from current implementation
   - Usage examples and best practices

#### Deliverables
- Complete test suite
- API documentation
- User guide and examples

---

## Implementation Priority

### Phase 1 (Critical - Week 1) ✅ COMPLETED
- ✅ Milestone 1: Core Event Mapping
- ✅ Basic testing infrastructure (linting, type checking)

### Phase 2 (High - Week 2)
- Milestone 2: Session Lifecycle Events
- Milestone 3: User Interaction Events

### Phase 3 (Medium - Week 3)
- Milestone 4: Advanced Features
- Integration testing

### Phase 4 (Final - Week 4)
- Milestone 5: Testing & Documentation
- Production readiness review

## Technical Considerations

### Backward Compatibility
- Maintain support for existing OpenCode plugin interface
- Provide migration path for current users
- Support gradual rollout with feature flags

### Performance
- Minimize overhead on tool execution
- Implement efficient event batching
- Use async processing where possible

### Security
- Sanitize sensitive data in events
- Implement secure communication to monitor service
- Add authentication/authorization support

### Extensibility
- Design for future Claude hook additions
- Support custom event types
- Enable plugin extensions

## Success Criteria
1. ✅ All Claude hook events are captured
2. ✅ Event payloads match Claude's structure
3. ✅ Response control features work correctly
4. ✅ No performance degradation
5. ✅ Full test coverage achieved
6. ✅ Documentation is complete

## Risk Mitigation
- **Risk:** OpenCode API limitations
  - **Mitigation:** Work with OpenCode team for missing features

- **Risk:** Performance impact
  - **Mitigation:** Implement configurable event filtering

- **Risk:** Breaking changes
  - **Mitigation:** Version the API and support legacy formats

## Next Steps
1. Review and approve design document
2. Set up development environment
3. Begin Milestone 1 implementation
4. Establish testing framework