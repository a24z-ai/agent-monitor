/**
 * Full Claude-aligned OpenCode Plugin with complete event support
 * Implements all milestones: Core Events, Session Lifecycle, User Interactions
 */

import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { getToolMetadata } from '../constants/tools';
import { SessionManager } from '../services/session-manager';
import {
  NotificationType,
  type ResponseControl,
  UserInteractionHandler,
} from '../services/user-interaction-handler';
import type {
  ClaudeHookEvent,
  ClaudePostToolUseEvent,
  ClaudePreToolUseEvent,
  ClaudeUserPromptSubmitEvent,
} from '../types/claude-events';
import { logger } from '../utils/logger';

const VSCODE_PORT = 3043;
const VSCODE_HOST = 'localhost';
const ENDPOINT = `http://${VSCODE_HOST}:${VSCODE_PORT}/opencode-hook`;

interface MonitorResponse extends ResponseControl {
  // ResponseControl includes: block, reason, modifiedPrompt, contextToInject, suppressOutput, systemMessage
  metadata?: Record<string, unknown>;
}

/**
 * Full Claude-aligned Monitor Plugin
 */
export const FullClaudeMonitorPlugin: Plugin = async ({
  project,
  directory,
  worktree,
  client,
  $,
}: PluginInput) => {
  logger.log(
    '[Agent Monitor] Full Claude plugin loaded with user interactions, sending to:',
    ENDPOINT
  );

  // Initialize managers
  const transcriptBasePath = `${directory}/.opencode/transcripts`;
  const sessionManager = new SessionManager(directory, transcriptBasePath);
  const interactionHandler = new UserInteractionHandler(directory, transcriptBasePath);

  // Track pending responses for context injection
  const pendingContextInjections = new Map<string, string>();
  const pendingSystemMessages = new Map<string, string>();

  /**
   * Send Claude event and get response control
   */
  async function sendClaudeEventWithControl(
    event: Partial<ClaudeHookEvent>
  ): Promise<MonitorResponse> {
    logger.log('[Agent Monitor] Sending Claude event:', event.hook_event_name, {
      session: event.session_id,
      tool: 'tool_name' in event ? event.tool_name : undefined,
      prompt:
        'prompt' in event
          ? `${(event as ClaudeUserPromptSubmitEvent).prompt.substring(0, 50)}...`
          : undefined,
    });

    try {
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

      // Parse response for control instructions
      const control = (await response.json()) as MonitorResponse;
      return control;
    } catch (error) {
      // If monitor server is unreachable, fail silently and allow operation
      logger.warn('[Agent Monitor] Monitor server unreachable, allowing operation:', error);
      return { block: false };
    }
  }

  /**
   * Send simple Claude event (no response control expected)
   */
  async function sendClaudeEvent(event: Partial<ClaudeHookEvent>): Promise<void> {
    await sendClaudeEventWithControl(event);
  }

  /**
   * Handle blocked prompt notification
   */
  async function handleBlockedPrompt(
    sessionId: string,
    reason: string | undefined,
    transcriptPath: string
  ): Promise<null> {
    logger.log('[Agent Monitor] Prompt blocked:', reason);

    interactionHandler.createNotification(
      sessionId,
      NotificationType.TOOL_BLOCKED,
      reason || 'Prompt was blocked by monitor',
      'warning'
    );

    const notifEvent = interactionHandler.buildNotificationEvent(
      sessionId,
      `Prompt blocked: ${reason}`,
      transcriptPath
    );
    await sendClaudeEvent(notifEvent);

    return null;
  }

  /**
   * Handle prompt triggers and send notifications
   */
  async function handlePromptTriggers(
    sessionId: string,
    prompt: string,
    transcriptPath: string
  ): Promise<void> {
    const triggerType = interactionHandler.checkPromptTriggers(prompt);
    if (!triggerType) {
      return;
    }

    const notification = interactionHandler.createNotification(
      sessionId,
      triggerType,
      `Prompt triggered ${triggerType} notification`,
      triggerType === NotificationType.PERMISSION_NEEDED ? 'warning' : 'info'
    );

    const notifEvent = interactionHandler.buildNotificationEvent(
      sessionId,
      notification.message,
      transcriptPath
    );
    await sendClaudeEvent(notifEvent);
  }

  /**
   * Handle user prompt error
   */
  function handlePromptError(sessionId: string, error: unknown): string {
    logger.error('[Agent Monitor] Failed to process user prompt:', error);

    interactionHandler.createNotification(
      sessionId,
      NotificationType.ERROR_OCCURRED,
      `Failed to process prompt: ${(error as Error).message}`,
      'error'
    );

    // Allow prompt to proceed on error (fail open)
    return '';
  }

  /**
   * Handle user prompt with full control
   */
  async function handleUserPrompt(sessionId: string, prompt: string): Promise<string | null> {
    const session =
      sessionManager.getSession(sessionId) || sessionManager.initSession(sessionId, 'startup');

    // Build UserPromptSubmit event
    const promptEvent: Partial<ClaudeUserPromptSubmitEvent> = {
      hook_event_name: 'UserPromptSubmit',
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: directory,
      prompt,
    };

    try {
      // Send event and get control response
      const control = await sendClaudeEventWithControl(promptEvent);

      // Process prompt with control
      const promptMetadata = interactionHandler.processUserPrompt(sessionId, prompt, control);

      // Handle blocking
      if (control.block) {
        return await handleBlockedPrompt(sessionId, control.reason, session.transcriptPath);
      }

      // Handle prompt modification
      if (control.modifiedPrompt) {
        logger.log('[Agent Monitor] Prompt modified');
        promptMetadata.modifiedPrompt = control.modifiedPrompt;
      }

      // Store context to inject
      if (control.contextToInject) {
        pendingContextInjections.set(sessionId, control.contextToInject);
        logger.log('[Agent Monitor] Context will be injected into response');
      }

      // Store system message
      if (control.systemMessage) {
        pendingSystemMessages.set(sessionId, control.systemMessage);
        logger.log('[Agent Monitor] System message will be added');
      }

      // Check for prompt triggers that need notifications
      await handlePromptTriggers(sessionId, prompt, session.transcriptPath);

      // Return modified prompt or original
      return control.modifiedPrompt || prompt;
    } catch (error) {
      handlePromptError(sessionId, error);
      return prompt;
    }
  }

  /**
   * Sanitize sensitive tool arguments
   */
  function sanitizeSensitiveArgs(args: Record<string, unknown>) {
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
   * Sanitize a single argument value
   */
  function sanitizeArgValue(key: string, value: unknown): unknown {
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

  /**
   * Sanitize tool input based on sensitivity
   */
  function sanitizeToolInput(toolName: string, args: Record<string, unknown>): unknown {
    const metadata = getToolMetadata(toolName);

    if (metadata?.sensitive) {
      return sanitizeSensitiveArgs(args);
    }

    // For non-sensitive tools
    const safeArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      safeArgs[key] = sanitizeArgValue(key, value);
    }
    return safeArgs;
  }

  /**
   * Check for idle timeout and send notification
   */
  function setupIdleNotifications() {
    setInterval(() => {
      for (const session of sessionManager.getActiveSessions()) {
        const now = Date.now();
        if (now - session.lastActivity > 55000 && now - session.lastActivity < 60000) {
          // About to go idle
          interactionHandler.createNotification(
            session.sessionId,
            NotificationType.IDLE_WARNING,
            'Session will become idle in 5 seconds',
            'warning'
          );

          // Send notification event
          const notifEvent = interactionHandler.buildNotificationEvent(
            session.sessionId,
            'Session idle warning',
            session.transcriptPath
          );
          sendClaudeEvent(notifEvent).catch(logger.error);
        }
      }
    }, 5000);
  }

  // Start idle notification checker
  setupIdleNotifications();

  return {
    // Hook into chat messages for UserPromptSubmit
    'chat.message': async (_input, output) => {
      const { message, parts } = output;
      const sessionId = (message as { sessionID?: string })?.sessionID || 'unknown';

      // Check if this is a user message
      const isUserMessage = (message as { role?: string })?.role === 'user';
      if (!isUserMessage) return;

      // Extract prompt text from parts
      const promptText = Array.isArray(parts)
        ? parts.map((p: any) => p.text || '').join('\n')
        : String(message);

      // Handle the user prompt with full control
      const processedPrompt = await handleUserPrompt(sessionId, promptText);

      // Update session activity
      sessionManager.handleUserMessage(sessionId);

      // If prompt was blocked, we need to prevent further processing
      if (processedPrompt === null) {
        throw new Error('Prompt blocked by monitor');
      }

      // If prompt was modified, update the message
      if (processedPrompt !== promptText) {
        (message as any).modifiedText = processedPrompt;
      }
    },

    // Hook into tool execution - PreToolUse
    'tool.execute.before': async (input, output) => {
      const { tool, sessionID } = input;
      const { args } = output;

      try {
        // Get or lazily initialize session (should already exist from session.updated event)
        let session = sessionManager.getSession(sessionID);
        if (!session) {
          // Fallback: initialize if session.updated didn't fire yet
          session = sessionManager.initSession(sessionID, 'startup');
          const sessionStartEvent = sessionManager.buildSessionStartEvent(sessionID);
          await sendClaudeEvent(sessionStartEvent);
          logger.warn('[Agent Monitor] Session initialized in fallback mode:', sessionID);
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

        const control = await sendClaudeEventWithControl(preToolEvent);

        // Check monitor response
        if (control.block) {
          // Create notification for blocked tool
          interactionHandler.createNotification(
            sessionID,
            NotificationType.TOOL_BLOCKED,
            `Tool ${tool} blocked: ${control.reason}`,
            'warning'
          );

          throw new Error(control.reason || 'Tool call blocked by agent monitor');
        }

        // Inject context if provided
        if (control.contextToInject) {
          logger.log('[Agent Monitor] Context injected for tool:', tool);
        }

        // Mark session as responding
        sessionManager.setResponding(sessionID, true);
      } catch (error) {
        // Only re-throw if it's an intentional block error
        // Connection errors are already handled in sendClaudeEventWithControl
        if ((error as Error).message?.includes('blocked by agent monitor')) {
          throw error;
        }
        // For other errors, log and allow the tool to proceed
        logger.warn('[Agent Monitor] Error in tool pre-execution, allowing tool:', error);
      }
    },

    // Hook into tool completion - PostToolUse
    'tool.execute.after': async (input, output) => {
      const { tool, sessionID } = input;
      const session = sessionManager.getSession(sessionID);

      if (!session) {
        logger.warn('[Agent Monitor] Session not found for post-execute:', sessionID);
        return;
      }

      try {
        // Apply context injection if pending
        const pendingContext = pendingContextInjections.get(sessionID);
        if (pendingContext) {
          logger.log('[Agent Monitor] Injecting context into tool response');
          (output as any).contextInjected = pendingContext;
          pendingContextInjections.delete(sessionID);
        }

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
            context_injected: !!pendingContext,
          },
        };

        await sendClaudeEvent(postToolEvent);

        // Mark tool as completed
        sessionManager.completeTool(sessionID, tool);

        // Check if SubagentStop should be sent (for Task tool)
        if (tool === 'Task') {
          const subagentStopEvent = sessionManager.buildSubagentStopEvent(sessionID);
          await sendClaudeEvent(subagentStopEvent);
        }

        // Schedule Stop event check
        setTimeout(async () => {
          sessionManager.setResponding(sessionID, false);
          const session = sessionManager.getSession(sessionID);
          if (session?.stopHookActive) {
            const stopEvent = sessionManager.buildStopEvent(sessionID);
            await sendClaudeEvent(stopEvent);
          }
        }, 500);
      } catch (error) {
        logger.error('[Agent Monitor] Failed to send PostToolUse event:', error);
      }
    },

    // Monitor session lifecycle
    event: async ({ event }) => {
      try {
        if (event.type === 'session.updated') {
          // session.updated fires when session is created or modified
          const sessionInfo = event.properties.info;
          const sessionID = sessionInfo?.id;

          if (sessionID) {
            // Check if this is a new session
            const existingSession = sessionManager.getSession(sessionID);
            if (!existingSession) {
              // New session - initialize and send SessionStart
              sessionManager.initSession(sessionID, 'startup');
              const sessionStartEvent = sessionManager.buildSessionStartEvent(sessionID);
              await sendClaudeEvent(sessionStartEvent);

              logger.log('[Agent Monitor] New session created:', sessionID);
            }
          }
        } else if (event.type === 'session.idle') {
          const sessionID = event.properties.sessionID;
          const session = sessionManager.getSession(sessionID);

          if (session) {
            // session.idle means agent stopped responding, send Stop event
            sessionManager.setResponding(sessionID, false);
            const stopEvent = sessionManager.buildStopEvent(sessionID);
            await sendClaudeEvent(stopEvent);

            logger.log('[Agent Monitor] Agent stopped responding (session.idle)');
          }
        } else if (event.type === 'session.deleted') {
          // session.deleted fires when user closes OpenCode or session ends
          const sessionInfo = event.properties.info;
          const sessionID = sessionInfo?.id || 'unknown';
          const session = sessionManager.getSession(sessionID);

          if (session) {
            // Send SessionEnd event
            const sessionEndEvent = sessionManager.buildSessionEndEvent(sessionID);
            await sendClaudeEvent(sessionEndEvent);

            // Get session stats for final notification
            const stats = interactionHandler.getSessionStats(sessionID);
            const _summaryMessage = `Session ended: ${stats.totalPrompts} prompts, ${stats.blockedPrompts} blocked`;

            // Clean up
            sessionManager.endSession(sessionID, 'deleted');
            interactionHandler.clearSession(sessionID);

            logger.log('[Agent Monitor] Session deleted (session.deleted)');
          }
        } else if (event.type === 'session.error') {
          const sessionID = event.properties.sessionID || 'unknown';
          const errorName = (event.properties.error as { name?: string })?.name || 'unknown';

          // Create error notification
          interactionHandler.createNotification(
            sessionID,
            NotificationType.ERROR_OCCURRED,
            `Session error: ${errorName}`,
            'error'
          );

          // Send notification event
          const session = sessionManager.getSession(sessionID);
          if (session) {
            const notifEvent = interactionHandler.buildNotificationEvent(
              sessionID,
              `Session error: ${errorName}`,
              session.transcriptPath
            );
            await sendClaudeEvent(notifEvent);

            // End session
            sessionManager.endSession(sessionID, `error: ${errorName}`, event.properties.error);
            const sessionEndEvent = sessionManager.buildSessionEndEvent(sessionID);
            await sendClaudeEvent(sessionEndEvent);
          }
        }
      } catch (error) {
        logger.error('[Agent Monitor] Failed to send session event:', error);
      }
    },
  };
};
