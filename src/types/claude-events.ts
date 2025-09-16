/**
 * Claude Hook Event Types - Aligned with Official Claude Code Documentation
 * https://docs.anthropic.com/en/docs/claude-code/hooks
 */

/**
 * Common fields present in all Claude hook events
 */
export interface ClaudeHookCommon {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
}

/**
 * PreToolUse event - before tool execution
 */
export interface ClaudePreToolUseEvent extends ClaudeHookCommon {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: unknown; // Structure depends on the tool
}

/**
 * PostToolUse event - after tool execution
 */
export interface ClaudePostToolUseEvent extends ClaudeHookCommon {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown; // Structure depends on the tool
}

/**
 * UserPromptSubmit event - when user submits a prompt
 */
export interface ClaudeUserPromptSubmitEvent extends ClaudeHookCommon {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

/**
 * Notification event
 */
export interface ClaudeNotificationEvent extends ClaudeHookCommon {
  hook_event_name: 'Notification';
  message: string;
}

/**
 * Stop event - when main agent finishes responding
 */
export interface ClaudeStopEvent extends ClaudeHookCommon {
  hook_event_name: 'Stop';
  stop_hook_active?: boolean;
}

/**
 * SubagentStop event - when a subagent (Task tool) finishes
 */
export interface ClaudeSubagentStopEvent extends ClaudeHookCommon {
  hook_event_name: 'SubagentStop';
  stop_hook_active?: boolean;
}

/**
 * PreCompact event - before context compaction
 */
export interface ClaudePreCompactEvent extends ClaudeHookCommon {
  hook_event_name: 'PreCompact';
  trigger: 'manual' | 'auto';
  custom_instructions?: string;
}

/**
 * SessionStart event - when session starts or resumes
 */
export interface ClaudeSessionStartEvent extends ClaudeHookCommon {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume' | 'clear';
}

/**
 * SessionEnd event - when session terminates
 */
export interface ClaudeSessionEndEvent extends ClaudeHookCommon {
  hook_event_name: 'SessionEnd';
  reason: string;
}

/**
 * Union type of all Claude hook events
 */
export type ClaudeHookEvent =
  | ClaudePreToolUseEvent
  | ClaudePostToolUseEvent
  | ClaudeUserPromptSubmitEvent
  | ClaudeNotificationEvent
  | ClaudeStopEvent
  | ClaudeSubagentStopEvent
  | ClaudePreCompactEvent
  | ClaudeSessionStartEvent
  | ClaudeSessionEndEvent;

/**
 * Type guards for Claude events
 */
export function isClaudePreToolUse(data: unknown): data is ClaudePreToolUseEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'PreToolUse';
}

export function isClaudePostToolUse(data: unknown): data is ClaudePostToolUseEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'PostToolUse';
}

export function isClaudeUserPromptSubmit(data: unknown): data is ClaudeUserPromptSubmitEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'UserPromptSubmit';
}

export function isClaudeNotification(data: unknown): data is ClaudeNotificationEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'Notification';
}

export function isClaudeStop(data: unknown): data is ClaudeStopEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'Stop';
}

export function isClaudeSubagentStop(data: unknown): data is ClaudeSubagentStopEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'SubagentStop';
}

export function isClaudePreCompact(data: unknown): data is ClaudePreCompactEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'PreCompact';
}

export function isClaudeSessionStart(data: unknown): data is ClaudeSessionStartEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'SessionStart';
}

export function isClaudeSessionEnd(data: unknown): data is ClaudeSessionEndEvent {
  return isClaudeEvent(data) && data.hook_event_name === 'SessionEnd';
}

/**
 * Base type guard for Claude events
 */
export function isClaudeEvent(data: unknown): data is ClaudeHookEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'session_id' in data &&
    'transcript_path' in data &&
    'cwd' in data &&
    'hook_event_name' in data
  );
}

/**
 * OpenCode to Claude event mapping
 */
export interface OpenCodeToClaude {
  'tool.execute.before': 'PreToolUse';
  'tool.execute.after': 'PostToolUse';
  'session.started': 'SessionStart';
  'session.idle': 'SessionEnd';
  'session.error': 'SessionEnd';
}
