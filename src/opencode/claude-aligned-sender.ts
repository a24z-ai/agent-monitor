import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { getToolMetadata } from '../constants/tools';
import type {
  ClaudeHookEvent,
  ClaudePostToolUseEvent,
  ClaudePreToolUseEvent,
  ClaudeSessionEndEvent,
  ClaudeSessionStartEvent,
} from '../types/claude-events';

const VSCODE_PORT = 37123;
const VSCODE_HOST = 'localhost';
const ENDPOINT = `http://${VSCODE_HOST}:${VSCODE_PORT}/agent-monitor`;

interface SessionMetrics {
  startTime: number;
  toolCallCount: number;
  tools: Set<string>;
  transcript_path: string;
  lastToolArgs?: Record<string, unknown>;
}

interface MonitorResponse {
  block: boolean;
  reason?: string;
  context?: string; // Additional context to inject
}

/**
 * Claude-aligned OpenCode Plugin for Agent Monitoring
 */
export const ClaudeAlignedMonitorPlugin: Plugin = async ({
  project,
  directory,
  worktree,
}: PluginInput) => {
  console.log('[Agent Monitor] Claude-aligned plugin loaded, sending to:', ENDPOINT);

  // Track session metrics
  const sessions = new Map<string, SessionMetrics>();

  /**
   * Send Claude-formatted event to monitor
   */
  async function sendClaudeEvent(event: Partial<ClaudeHookEvent>): Promise<Response> {
    // Log the event locally
    console.log('[Agent Monitor] Sending Claude event:', event.hook_event_name, {
      tool: 'tool_name' in event ? event.tool_name : undefined,
      session: event.session_id,
    });

    // Send to VSCode extension
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        // Add OpenCode-specific metadata
        _opencode_meta: {
          project:
            typeof project === 'object' && project !== null && 'name' in project
              ? String(project.name)
              : 'unknown',
          directory,
          worktree,
          timestamp: Date.now(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send event: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  /**
   * Generate transcript path for session
   */
  function getTranscriptPath(sessionID: string): string {
    // In real implementation, this would track actual transcript location
    return `${directory}/.opencode/transcripts/${sessionID}.json`;
  }

  /**
   * Handle session end events
   */
  async function handleSessionEnd(
    sessionID: string,
    eventType: string,
    properties: Record<string, unknown> | undefined
  ): Promise<void> {
    if (!sessionID || !sessions.has(sessionID)) return;

    const session = sessions.get(sessionID);
    if (!session) return;

    const sessionEndEvent: Partial<ClaudeSessionEndEvent> = {
      hook_event_name: 'SessionEnd',
      session_id: sessionID,
      transcript_path: session.transcript_path,
      cwd: directory,
      reason:
        eventType === 'session.error'
          ? `error: ${(properties?.error as { name?: string })?.name || 'unknown'}`
          : 'idle',
    };

    await sendClaudeEvent(sessionEndEvent);
    sessions.delete(sessionID);
  }

  /**
   * Sanitize tool input based on tool sensitivity
   */
  function sanitizeToolInput(toolName: string, args: Record<string, unknown>): unknown {
    const metadata = getToolMetadata(toolName);

    if (metadata?.sensitive) {
      return sanitizeSensitiveArgs(args);
    }

    return sanitizeNonSensitiveArgs(args);
  }

  /**
   * Sanitize args for sensitive tools
   */
  function sanitizeSensitiveArgs(args: Record<string, unknown>): unknown {
    return {
      _sanitized: true,
      param_count: Object.keys(args).length,
      param_types: Object.keys(args).reduce(
        (acc, key) => {
          acc[key] = typeof args[key];
          return acc;
        },
        {} as Record<string, string>
      ),
    };
  }

  /**
   * Sanitize args for non-sensitive tools
   */
  function sanitizeNonSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
    const safeArgs: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      safeArgs[key] = sanitizeValue(key, value);
    }

    return safeArgs;
  }

  /**
   * Sanitize individual value based on key and type
   */
  function sanitizeValue(key: string, value: unknown): unknown {
    if (key === 'command' && typeof value === 'string') {
      return value.substring(0, 100);
    }

    if (key === 'pattern' || key === 'glob' || key === 'path') {
      return value;
    }

    if (typeof value === 'string' && value.length > 200) {
      return `${value.substring(0, 200)}... [truncated]`;
    }

    if (typeof value === 'object') {
      return '[object]';
    }

    return value;
  }

  return {
    // Hook into tool execution - maps to PreToolUse
    'tool.execute.before': async (input, output) => {
      const { tool, sessionID } = input;
      const { args } = output;

      try {
        // Initialize session tracking if needed
        if (!sessions.has(sessionID)) {
          const sessionMetrics: SessionMetrics = {
            startTime: Date.now(),
            toolCallCount: 0,
            tools: new Set(),
            transcript_path: getTranscriptPath(sessionID),
          };
          sessions.set(sessionID, sessionMetrics);

          // Send SessionStart event
          const sessionStartEvent: Partial<ClaudeSessionStartEvent> = {
            hook_event_name: 'SessionStart',
            session_id: sessionID,
            transcript_path: sessionMetrics.transcript_path,
            cwd: directory,
            source: 'startup',
          };
          await sendClaudeEvent(sessionStartEvent);
        }

        const session = sessions.get(sessionID);
        if (!session) return;

        session.toolCallCount++;
        session.tools.add(tool);
        session.lastToolArgs = args;

        // Send PreToolUse event
        const preToolEvent: Partial<ClaudePreToolUseEvent> = {
          hook_event_name: 'PreToolUse',
          session_id: sessionID,
          transcript_path: session.transcript_path,
          cwd: directory,
          tool_name: tool,
          tool_input: sanitizeToolInput(tool, args),
        };

        const response = await sendClaudeEvent(preToolEvent);

        // Check monitor response
        const result = (await response.json()) as MonitorResponse;
        if (result.block) {
          throw new Error(result.reason || 'Tool call blocked by agent monitor');
        }

        // If context is provided, it could be logged or used
        if (result.context) {
          console.log('[Agent Monitor] Context:', result.context);
        }
      } catch (error) {
        // If we can't reach the monitor or it rejects, block the tool call
        console.error('[Agent Monitor] Blocking tool call due to error:', error);
        throw new Error(`Agent monitor check failed: ${(error as Error).message}`);
      }
    },

    // Hook into tool completion - maps to PostToolUse
    'tool.execute.after': async (input, output) => {
      const { tool, sessionID } = input;
      const session = sessions.get(sessionID);

      if (!session) {
        console.warn('[Agent Monitor] Session not found for post-execute:', sessionID);
        return;
      }

      try {
        // Send PostToolUse event
        const postToolEvent: Partial<ClaudePostToolUseEvent> = {
          hook_event_name: 'PostToolUse',
          session_id: sessionID,
          transcript_path: session.transcript_path,
          cwd: directory,
          tool_name: tool,
          tool_input: sanitizeToolInput(tool, session.lastToolArgs || {}),
          tool_response: {
            title: output.title,
            output_length: output.output?.length || 0,
            has_metadata: !!output.metadata,
            success: true,
          },
        };

        await sendClaudeEvent(postToolEvent);
      } catch (error) {
        // Post-execution monitoring failures shouldn't affect the tool result
        console.error('[Agent Monitor] Failed to send PostToolUse event:', error);
      }
    },

    // Monitor session lifecycle
    event: async ({ event }) => {
      try {
        if (event.type === 'session.idle') {
          const sessionID = event.properties.sessionID;
          await handleSessionEnd(sessionID, event.type, event.properties);
        } else if (event.type === 'session.error') {
          const sessionID = event.properties.sessionID || 'unknown';
          await handleSessionEnd(sessionID, event.type, event.properties);
        }
        // Note: session.resumed doesn't exist in OpenCode events
        // We'll handle session start through tool.execute.before instead
      } catch (error) {
        console.error('[Agent Monitor] Failed to send session event:', error);
      }
    },
  };
};
