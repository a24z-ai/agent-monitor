/**
 * Session State Manager for OpenCode Plugin
 * Manages session lifecycle and tracks agent completion states
 */

import type {
  ClaudeSessionEndEvent,
  ClaudeSessionStartEvent,
  ClaudeStopEvent,
  ClaudeSubagentStopEvent,
} from '../types/claude-events';

export interface SessionState {
  sessionId: string;
  startTime: number;
  lastActivity: number;
  transcriptPath: string;
  cwd: string;

  // Session source tracking
  source: 'startup' | 'resume' | 'clear';
  isFirstMessage: boolean;

  // Tool tracking
  toolCallCount: number;
  activeTools: Set<string>;
  completedTools: Set<string>;
  lastToolName?: string;
  lastToolArgs?: Record<string, unknown>;

  // Agent state
  isResponding: boolean;
  hasSubagent: boolean;
  subagentCallId?: string;
  messageCount: number;

  // Session end tracking
  endReason?: string;
  errorDetails?: unknown;

  // Stop hook tracking
  stopHookActive: boolean;
  subagentStopHookActive: boolean;
}

export class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private readonly idleTimeout: number = 60000; // 60 seconds
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly cwd: string,
    private readonly transcriptBasePath: string
  ) {}

  /**
   * Initialize or resume a session
   */
  initSession(sessionId: string, source?: 'startup' | 'resume' | 'clear'): SessionState {
    const existing = this.sessions.get(sessionId);

    if (existing && source === 'resume') {
      // Resume existing session
      existing.source = 'resume';
      existing.lastActivity = Date.now();
      this.resetIdleTimer(sessionId);
      return existing;
    }

    // Determine source if not provided
    const actualSource = source || (existing ? 'resume' : 'startup');

    const session: SessionState = {
      sessionId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      transcriptPath: `${this.transcriptBasePath}/${sessionId}.json`,
      cwd: this.cwd,
      source: actualSource,
      isFirstMessage: true,
      toolCallCount: 0,
      activeTools: new Set(),
      completedTools: new Set(),
      isResponding: false,
      hasSubagent: false,
      messageCount: 0,
      stopHookActive: false,
      subagentStopHookActive: false,
    };

    this.sessions.set(sessionId, session);
    this.resetIdleTimer(sessionId);

    return session;
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      this.resetIdleTimer(sessionId);
    }
  }

  /**
   * Mark session as responding (agent is generating output)
   */
  setResponding(sessionId: string, responding: boolean): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isResponding = responding;

      if (!responding) {
        // Agent stopped responding - potential Stop event
        this.checkForStopEvent(sessionId);
      }
    }
  }

  /**
   * Track tool execution
   */
  startTool(sessionId: string, toolName: string, args: Record<string, unknown>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivity = Date.now();
    session.toolCallCount++;
    session.activeTools.add(toolName);
    session.lastToolName = toolName;
    session.lastToolArgs = args;
    session.isFirstMessage = false;

    // Check if this is a Task tool (subagent)
    if (toolName === 'Task') {
      session.hasSubagent = true;
      session.subagentCallId = `${sessionId}-task-${Date.now()}`;
    }

    this.resetIdleTimer(sessionId);
  }

  /**
   * Mark tool as completed
   */
  completeTool(sessionId: string, toolName: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.activeTools.delete(toolName);
    session.completedTools.add(toolName);

    // Check for SubagentStop if Task tool completed
    if (toolName === 'Task' && session.hasSubagent) {
      this.handleSubagentStop(sessionId);
    }

    // Check if all tools completed (potential Stop event)
    if (session.activeTools.size === 0 && !session.isResponding) {
      this.checkForStopEvent(sessionId);
    }
  }

  /**
   * Handle message from user
   */
  handleUserMessage(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageCount++;
      session.isResponding = true;
      session.lastActivity = Date.now();
      this.resetIdleTimer(sessionId);
    }
  }

  /**
   * Check if conditions indicate a Stop event
   */
  private checkForStopEvent(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Stop event occurs when:
    // 1. Agent is not responding
    // 2. No active tools
    // 3. Has processed at least one message
    if (
      !session.isResponding &&
      session.activeTools.size === 0 &&
      session.messageCount > 0 &&
      !session.stopHookActive
    ) {
      session.stopHookActive = true;
      // Will be handled by the plugin to send Stop event
    }
  }

  /**
   * Handle subagent completion
   */
  private handleSubagentStop(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.hasSubagent && !session.subagentStopHookActive) {
      session.subagentStopHookActive = true;
      session.hasSubagent = false;
      // Will be handled by the plugin to send SubagentStop event
    }
  }

  /**
   * End session with reason
   */
  endSession(sessionId: string, reason: string, error?: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.endReason = reason;
    session.errorDetails = error;

    // Clear idle timer
    const timer = this.idleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sessionId);
    }

    // Remove session after a delay to allow final events
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 5000);
  }

  /**
   * Reset idle timer for session
   */
  private resetIdleTimer(sessionId: string): void {
    // Clear existing timer
    const existingTimer = this.idleTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.handleIdleTimeout(sessionId);
    }, this.idleTimeout);

    this.idleTimers.set(sessionId, timer);
  }

  /**
   * Handle session idle timeout
   */
  private handleIdleTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Mark session as idle
    this.endSession(sessionId, 'idle');
  }

  /**
   * Build SessionStart event
   */
  buildSessionStartEvent(sessionId: string): Partial<ClaudeSessionStartEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      hook_event_name: 'SessionStart',
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: session.cwd,
      source: session.source,
    };
  }

  /**
   * Build SessionEnd event
   */
  buildSessionEndEvent(sessionId: string): Partial<ClaudeSessionEndEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      hook_event_name: 'SessionEnd',
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: session.cwd,
      reason: session.endReason || 'unknown',
    };
  }

  /**
   * Build Stop event
   */
  buildStopEvent(sessionId: string): Partial<ClaudeStopEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      hook_event_name: 'Stop',
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: session.cwd,
      stop_hook_active: session.stopHookActive,
    };
  }

  /**
   * Build SubagentStop event
   */
  buildSubagentStopEvent(sessionId: string): Partial<ClaudeSubagentStopEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      hook_event_name: 'SubagentStop',
      session_id: sessionId,
      transcript_path: session.transcriptPath,
      cwd: session.cwd,
      stop_hook_active: session.subagentStopHookActive,
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clean up manager
   */
  dispose(): void {
    // Clear all idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    this.sessions.clear();
  }
}
