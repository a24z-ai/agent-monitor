/**
 * User Interaction Handler for OpenCode Plugin
 * Manages UserPromptSubmit, Notification events, and response control
 */

import type { ClaudeNotificationEvent, ClaudeUserPromptSubmitEvent } from '../types/claude-events';

/**
 * Response control instructions from monitor
 */
export interface ResponseControl {
  block: boolean;
  reason?: string;
  modifiedPrompt?: string;
  contextToInject?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
}

/**
 * Notification types based on Claude's notification scenarios
 */
export enum NotificationType {
  PERMISSION_NEEDED = 'permission_needed',
  IDLE_WARNING = 'idle_warning',
  TOOL_BLOCKED = 'tool_blocked',
  ERROR_OCCURRED = 'error_occurred',
  SESSION_UPDATE = 'session_update',
  CONTEXT_LIMIT = 'context_limit',
  RATE_LIMITED = 'rate_limited',
  CUSTOM = 'custom',
}

/**
 * User prompt tracking
 */
export interface PromptMetadata {
  promptId: string;
  sessionId: string;
  timestamp: number;
  originalPrompt: string;
  modifiedPrompt?: string;
  wasBlocked: boolean;
  blockReason?: string;
  contextInjected?: string;
  characterCount: number;
  wordCount: number;
  hasCodeBlocks: boolean;
  hasUrls: boolean;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'command';
}

/**
 * Notification metadata
 */
export interface NotificationMetadata {
  notificationId: string;
  sessionId: string;
  timestamp: number;
  type: NotificationType;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  requiresAction: boolean;
  actionTaken?: string;
  dismissed: boolean;
}

export class UserInteractionHandler {
  private prompts: Map<string, PromptMetadata> = new Map();
  private notifications: Map<string, NotificationMetadata> = new Map();
  private promptHistory: Map<string, string[]> = new Map(); // Session -> prompt IDs
  private notificationQueue: NotificationMetadata[] = [];
  private readonly maxHistorySize = 100;

  constructor(
    private readonly cwd: string,
    readonly _transcriptBasePath: string
  ) {}

  /**
   * Process user prompt submission
   */
  processUserPrompt(sessionId: string, prompt: string, control?: ResponseControl): PromptMetadata {
    const promptId = `${sessionId}-prompt-${Date.now()}`;

    // Analyze prompt characteristics
    const metadata: PromptMetadata = {
      promptId,
      sessionId,
      timestamp: Date.now(),
      originalPrompt: prompt,
      modifiedPrompt: control?.modifiedPrompt,
      wasBlocked: control?.block || false,
      blockReason: control?.reason,
      contextInjected: control?.contextToInject,
      characterCount: prompt.length,
      wordCount: prompt.split(/\s+/).filter((w) => w.length > 0).length,
      hasCodeBlocks: /```[\s\S]*?```/.test(prompt),
      hasUrls: /https?:\/\/[^\s]+/.test(prompt),
      sentiment: this.analyzeSentiment(prompt),
    };

    // Store prompt metadata
    this.prompts.set(promptId, metadata);

    // Update session history
    const history = this.promptHistory.get(sessionId) || [];
    history.push(promptId);

    // Limit history size
    if (history.length > this.maxHistorySize) {
      const removed = history.shift();
      if (removed) {
        this.prompts.delete(removed);
      }
    }

    this.promptHistory.set(sessionId, history);

    return metadata;
  }

  /**
   * Create a notification
   */
  createNotification(
    sessionId: string,
    type: NotificationType,
    message: string,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'info'
  ): NotificationMetadata {
    const notificationId = `${sessionId}-notif-${Date.now()}`;

    const notification: NotificationMetadata = {
      notificationId,
      sessionId,
      timestamp: Date.now(),
      type,
      message,
      severity,
      requiresAction: severity === 'error' || severity === 'critical',
      dismissed: false,
    };

    this.notifications.set(notificationId, notification);
    this.notificationQueue.push(notification);

    // Auto-dismiss info notifications after storing
    if (severity === 'info') {
      setTimeout(() => {
        notification.dismissed = true;
      }, 5000);
    }

    return notification;
  }

  /**
   * Get pending notifications for a session
   */
  getPendingNotifications(sessionId: string): NotificationMetadata[] {
    return this.notificationQueue.filter(
      (n) => n.sessionId === sessionId && !n.dismissed && n.requiresAction
    );
  }

  /**
   * Dismiss a notification
   */
  dismissNotification(notificationId: string, actionTaken?: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.dismissed = true;
      notification.actionTaken = actionTaken;

      // Remove from queue
      const index = this.notificationQueue.findIndex((n) => n.notificationId === notificationId);
      if (index !== -1) {
        this.notificationQueue.splice(index, 1);
      }
    }
  }

  /**
   * Analyze prompt sentiment/intent
   */
  private analyzeSentiment(prompt: string): 'positive' | 'negative' | 'neutral' | 'command' {
    const lower = prompt.toLowerCase();

    // Command-like prompts
    if (
      lower.startsWith('create ') ||
      lower.startsWith('make ') ||
      lower.startsWith('build ') ||
      lower.startsWith('implement ') ||
      lower.startsWith('fix ') ||
      lower.startsWith('update ') ||
      lower.startsWith('delete ') ||
      lower.startsWith('run ')
    ) {
      return 'command';
    }

    // Negative sentiment indicators
    if (
      lower.includes("doesn't work") ||
      lower.includes('error') ||
      lower.includes('bug') ||
      lower.includes('wrong') ||
      lower.includes('failed') ||
      lower.includes("can't")
    ) {
      return 'negative';
    }

    // Positive sentiment indicators
    if (
      lower.includes('great') ||
      lower.includes('good') ||
      lower.includes('thanks') ||
      lower.includes('perfect') ||
      lower.includes('excellent')
    ) {
      return 'positive';
    }

    return 'neutral';
  }

  /**
   * Build UserPromptSubmit event
   */
  buildUserPromptSubmitEvent(
    sessionId: string,
    prompt: string,
    transcriptPath: string
  ): Partial<ClaudeUserPromptSubmitEvent> {
    return {
      hook_event_name: 'UserPromptSubmit',
      session_id: sessionId,
      transcript_path: transcriptPath,
      cwd: this.cwd,
      prompt,
    };
  }

  /**
   * Build Notification event
   */
  buildNotificationEvent(
    sessionId: string,
    message: string,
    transcriptPath: string
  ): Partial<ClaudeNotificationEvent> {
    return {
      hook_event_name: 'Notification',
      session_id: sessionId,
      transcript_path: transcriptPath,
      cwd: this.cwd,
      message,
    };
  }

  /**
   * Get prompt history for a session
   */
  getPromptHistory(sessionId: string): PromptMetadata[] {
    const history = this.promptHistory.get(sessionId) || [];
    return history
      .map((id) => this.prompts.get(id))
      .filter((p): p is PromptMetadata => p !== undefined);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    totalPrompts: number;
    blockedPrompts: number;
    averagePromptLength: number;
    codeBlockCount: number;
    urlCount: number;
    sentimentBreakdown: Record<string, number>;
  } {
    const history = this.getPromptHistory(sessionId);

    if (history.length === 0) {
      return {
        totalPrompts: 0,
        blockedPrompts: 0,
        averagePromptLength: 0,
        codeBlockCount: 0,
        urlCount: 0,
        sentimentBreakdown: {},
      };
    }

    const sentimentCounts: Record<string, number> = {
      positive: 0,
      negative: 0,
      neutral: 0,
      command: 0,
    };

    let totalLength = 0;
    let blockedCount = 0;
    let codeBlockCount = 0;
    let urlCount = 0;

    for (const prompt of history) {
      totalLength += prompt.characterCount;
      if (prompt.wasBlocked) blockedCount++;
      if (prompt.hasCodeBlocks) codeBlockCount++;
      if (prompt.hasUrls) urlCount++;
      if (prompt.sentiment) {
        sentimentCounts[prompt.sentiment]++;
      }
    }

    return {
      totalPrompts: history.length,
      blockedPrompts: blockedCount,
      averagePromptLength: Math.round(totalLength / history.length),
      codeBlockCount,
      urlCount,
      sentimentBreakdown: sentimentCounts,
    };
  }

  /**
   * Check if prompt should trigger a notification
   */
  checkPromptTriggers(prompt: string): NotificationType | null {
    const lower = prompt.toLowerCase();

    // Check for dangerous commands
    if (
      lower.includes('rm -rf') ||
      lower.includes('format ') ||
      lower.includes('delete all') ||
      lower.includes('drop database')
    ) {
      return NotificationType.PERMISSION_NEEDED;
    }

    // Check for potential issues
    if (
      lower.includes('api key') ||
      lower.includes('password') ||
      lower.includes('secret') ||
      lower.includes('credential')
    ) {
      return NotificationType.TOOL_BLOCKED;
    }

    // Check for context-heavy requests
    if (prompt.length > 10000) {
      return NotificationType.CONTEXT_LIMIT;
    }

    return null;
  }

  /**
   * Clear session data
   */
  clearSession(sessionId: string): void {
    // Remove prompt history
    const history = this.promptHistory.get(sessionId) || [];
    for (const promptId of history) {
      this.prompts.delete(promptId);
    }
    this.promptHistory.delete(sessionId);

    // Remove notifications
    const notificationIds = Array.from(this.notifications.keys()).filter(
      (id) => this.notifications.get(id)?.sessionId === sessionId
    );

    for (const id of notificationIds) {
      this.notifications.delete(id);
    }

    // Clear from queue
    this.notificationQueue = this.notificationQueue.filter((n) => n.sessionId !== sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.promptHistory.keys());
  }

  /**
   * Clean up handler
   */
  dispose(): void {
    this.prompts.clear();
    this.notifications.clear();
    this.promptHistory.clear();
    this.notificationQueue = [];
  }
}
