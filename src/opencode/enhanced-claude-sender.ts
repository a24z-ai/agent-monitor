/**
 * Enhanced Claude-aligned OpenCode Plugin with full session lifecycle support
 * Implements Stop, SubagentStop, and improved session tracking
 */

import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { getToolMetadata } from '../constants/tools';
import { SessionManager } from '../services/session-manager';
import type {
  ClaudeHookEvent,
  ClaudePostToolUseEvent,
  ClaudePreToolUseEvent,
} from '../types/claude-events';
import { logger } from '../utils/logger';

const VSCODE_PORT = 37123;
const VSCODE_HOST = 'localhost';
const ENDPOINT = `http://${VSCODE_HOST}:${VSCODE_PORT}/agent-monitor`;

interface MonitorResponse {
  block: boolean;
  reason?: string;
  context?: string;
}

/**
 * Enhanced Claude-aligned Monitor Plugin
 */
export const EnhancedClaudeMonitorPlugin: Plugin = async ({
  project,
  directory,
  worktree,
}: PluginInput) => {
  logger.log('[Agent Monitor] Enhanced Claude plugin loaded, sending to:', ENDPOINT);

  // Initialize session manager
  const sessionManager = new SessionManager(directory, `${directory}/.opencode/transcripts`);

  // Track if we've seen user messages (for Stop detection)
  const sessionMessageTracking = new Map<
    string,
    {
      lastUserMessageTime: number;
      pendingStopCheck: boolean;
    }
  >();

  /**
   * Send Claude-formatted event to monitor
   */
  async function sendClaudeEvent(event: Partial<ClaudeHookEvent>): Promise<Response> {
    logger.log('[Agent Monitor] Sending Claude event:', event.hook_event_name, {
      session: event.session_id,
      tool: 'tool_name' in event ? event.tool_name : undefined,
    });

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
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
   * Check and send Stop event if conditions are met
   */
  async function checkAndSendStopEvent(sessionId: string): Promise<void> {
    const session = sessionManager.getSession(sessionId);
    if (!session) return;

    // Check if Stop event should be sent
    if (session.stopHookActive && !session.isResponding && session.activeTools.size === 0) {
      try {
        const stopEvent = sessionManager.buildStopEvent(sessionId);
        await sendClaudeEvent(stopEvent);
        logger.log('[Agent Monitor] Stop event sent for session:', sessionId);

        // Reset stop hook flag
        session.stopHookActive = false;
      } catch (error) {
        logger.error('[Agent Monitor] Failed to send Stop event:', error);
      }
    }
  }

  /**
   * Check and send SubagentStop event if needed
   */
  async function checkAndSendSubagentStopEvent(sessionId: string): Promise<void> {
    const session = sessionManager.getSession(sessionId);
    if (!session) return;

    if (session.subagentStopHookActive) {
      try {
        const subagentStopEvent = sessionManager.buildSubagentStopEvent(sessionId);
        await sendClaudeEvent(subagentStopEvent);
        logger.log('[Agent Monitor] SubagentStop event sent for session:', sessionId);

        // Reset subagent stop flag
        session.subagentStopHookActive = false;
      } catch (error) {
        logger.error('[Agent Monitor] Failed to send SubagentStop event:', error);
      }
    }
  }

  /**
   * Handle session events
   */
  async function handleSessionEvent(event: {
    type: string;
    properties?: Record<string, unknown>;
  }): Promise<void> {
    if (event.type === 'session.idle' && event.properties) {
      await handleSessionIdle({ properties: event.properties as { sessionID: string } });
    } else if (event.type === 'session.error' && event.properties) {
      await handleSessionError({
        properties: event.properties as { sessionID?: string; error?: unknown },
      });
    } else if (event.type === 'session.deleted') {
      await handleSessionDeleted({ properties: event.properties as { sessionID?: string } });
    } else if (event.type === 'installation.updated') {
      await handleInstallationUpdated();
    }
  }

  /**
   * Handle session idle event
   */
  async function handleSessionIdle(event: { properties: { sessionID: string } }): Promise<void> {
    const sessionID = event.properties.sessionID;
    const session = sessionManager.getSession(sessionID);

    if (session) {
      await checkAndSendStopEvent(sessionID);
      const sessionEndEvent = sessionManager.buildSessionEndEvent(sessionID);
      await sendClaudeEvent(sessionEndEvent);
      sessionManager.endSession(sessionID, 'idle');
    }
  }

  /**
   * Handle session error event
   */
  async function handleSessionError(event: {
    properties: { sessionID?: string; error?: unknown };
  }): Promise<void> {
    const sessionID = event.properties.sessionID || 'unknown';
    const session = sessionManager.getSession(sessionID);

    if (session) {
      sessionManager.endSession(
        sessionID,
        `error: ${(event.properties.error as { name?: string })?.name || 'unknown'}`,
        event.properties.error
      );
      const sessionEndEvent = sessionManager.buildSessionEndEvent(sessionID);
      await sendClaudeEvent(sessionEndEvent);
    }
  }

  /**
   * Handle session deleted event
   */
  async function handleSessionDeleted(event: {
    properties?: { sessionID?: string };
  }): Promise<void> {
    const sessionID = (event as { properties?: { sessionID?: string } }).properties?.sessionID;
    if (sessionID) {
      const session = sessionManager.getSession(sessionID);
      if (session) {
        sessionManager.endSession(sessionID, 'deleted');
        const sessionEndEvent = sessionManager.buildSessionEndEvent(sessionID);
        await sendClaudeEvent(sessionEndEvent);
      }
    }
  }

  /**
   * Handle installation updated event
   */
  async function handleInstallationUpdated(): Promise<void> {
    logger.log('[Agent Monitor] Installation updated, clearing sessions');
    for (const session of sessionManager.getActiveSessions()) {
      sessionManager.endSession(session.sessionId, 'installation_updated');
    }
  }

  /**
   * Sanitize tool input based on sensitivity
   */
  function sanitizeToolInput(toolName: string, args: Record<string, unknown>): unknown {
    const metadata = getToolMetadata(toolName);

    if (metadata?.sensitive) {
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

    // For non-sensitive tools, include more details
    const safeArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (key === 'command' && typeof value === 'string') {
        safeArgs[key] = value.substring(0, 100);
      } else if (key === 'pattern' || key === 'glob' || key === 'path') {
        safeArgs[key] = value;
      } else if (typeof value === 'string' && value.length > 200) {
        safeArgs[key] = `${value.substring(0, 200)}... [truncated]`;
      } else if (typeof value === 'object') {
        safeArgs[key] = '[object]';
      } else {
        safeArgs[key] = value;
      }
    }
    return safeArgs;
  }

  return {
    // Hook into tool execution - maps to PreToolUse
    'tool.execute.before': async (input, output) => {
      const { tool, sessionID } = input;
      const { args } = output;

      try {
        // Initialize or get session
        let session = sessionManager.getSession(sessionID);
        if (!session) {
          session = sessionManager.initSession(sessionID, 'startup');

          // Send SessionStart event
          const sessionStartEvent = sessionManager.buildSessionStartEvent(sessionID);
          await sendClaudeEvent(sessionStartEvent);
        }

        // Track tool start
        sessionManager.startTool(sessionID, tool, args);

        // Send PreToolUse event
        const preToolEvent: Partial<ClaudePreToolUseEvent> = {
          hook_event_name: 'PreToolUse',
          session_id: sessionID,
          transcript_path: session.transcriptPath,
          cwd: session.cwd,
          tool_name: tool,
          tool_input: sanitizeToolInput(tool, args),
        };

        const response = await sendClaudeEvent(preToolEvent);

        // Check monitor response
        const result = (await response.json()) as MonitorResponse;
        if (result.block) {
          throw new Error(result.reason || 'Tool call blocked by agent monitor');
        }

        if (result.context) {
          logger.log('[Agent Monitor] Context:', result.context);
        }

        // Mark session as responding (agent is active)
        sessionManager.setResponding(sessionID, true);
      } catch (error) {
        logger.error('[Agent Monitor] Blocking tool call due to error:', error);
        throw new Error(`Agent monitor check failed: ${(error as Error).message}`);
      }
    },

    // Hook into tool completion - maps to PostToolUse
    'tool.execute.after': async (input, output) => {
      const { tool, sessionID } = input;
      const session = sessionManager.getSession(sessionID);

      if (!session) {
        logger.warn('[Agent Monitor] Session not found for post-execute:', sessionID);
        return;
      }

      try {
        // Send PostToolUse event
        const postToolEvent: Partial<ClaudePostToolUseEvent> = {
          hook_event_name: 'PostToolUse',
          session_id: sessionID,
          transcript_path: session.transcriptPath,
          cwd: session.cwd,
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

        // Mark tool as completed
        sessionManager.completeTool(sessionID, tool);

        // Check if SubagentStop should be sent (for Task tool)
        if (tool === 'Task') {
          await checkAndSendSubagentStopEvent(sessionID);
        }

        // Schedule Stop event check after a delay
        // This gives time for new tools to start if agent is still responding
        setTimeout(async () => {
          sessionManager.setResponding(sessionID, false);
          await checkAndSendStopEvent(sessionID);
        }, 500);
      } catch (error) {
        logger.error('[Agent Monitor] Failed to send PostToolUse event:', error);
      }
    },

    // Hook into chat messages for better Stop detection
    'chat.message': async (_input, output) => {
      const { message } = output;
      const sessionID = (message as { sessionID?: string })?.sessionID || 'unknown';

      // Track user messages for Stop event detection
      const tracking = sessionMessageTracking.get(sessionID) || {
        lastUserMessageTime: Date.now(),
        pendingStopCheck: false,
      };

      tracking.lastUserMessageTime = Date.now();
      tracking.pendingStopCheck = true;
      sessionMessageTracking.set(sessionID, tracking);

      // Update session manager
      sessionManager.handleUserMessage(sessionID);

      // Schedule Stop event check after typical response time
      setTimeout(async () => {
        const currentTracking = sessionMessageTracking.get(sessionID);
        if (currentTracking?.pendingStopCheck) {
          currentTracking.pendingStopCheck = false;
          await checkAndSendStopEvent(sessionID);
        }
      }, 3000);
    },

    // Monitor session lifecycle
    event: async ({ event }) => {
      try {
        await handleSessionEvent(event);
      } catch (error) {
        logger.error('[Agent Monitor] Failed to send session event:', error);
      }
    },
  };
};
