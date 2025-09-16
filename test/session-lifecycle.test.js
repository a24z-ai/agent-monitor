import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { SessionManager } from '../src/services/session-manager';

describe('Session Lifecycle Management', () => {
  let sessionManager;
  const mockCwd = '/test/directory';
  const mockTranscriptPath = '/test/transcripts';

  beforeEach(() => {
    sessionManager = new SessionManager(mockCwd, mockTranscriptPath);
  });

  afterEach(() => {
    sessionManager.dispose();
  });

  test('initializes new session with correct properties', () => {
    const sessionId = 'test-session-1';
    const session = sessionManager.initSession(sessionId, 'startup');

    expect(session.sessionId).toBe(sessionId);
    expect(session.source).toBe('startup');
    expect(session.cwd).toBe(mockCwd);
    expect(session.transcriptPath).toBe(`${mockTranscriptPath}/${sessionId}.json`);
    expect(session.isFirstMessage).toBe(true);
    expect(session.toolCallCount).toBe(0);
    expect(session.activeTools.size).toBe(0);
    expect(session.isResponding).toBe(false);
    expect(session.hasSubagent).toBe(false);
  });

  test('resumes existing session', () => {
    const sessionId = 'test-session-2';

    // Create initial session
    const session1 = sessionManager.initSession(sessionId, 'startup');
    session1.toolCallCount = 5;

    // Resume session
    const session2 = sessionManager.initSession(sessionId, 'resume');

    expect(session2.source).toBe('resume');
    expect(session2.toolCallCount).toBe(5);
    expect(session2.sessionId).toBe(sessionId);
  });

  test('tracks tool execution correctly', () => {
    const sessionId = 'test-session-3';
    const session = sessionManager.initSession(sessionId);

    sessionManager.startTool(sessionId, 'Bash', { command: 'ls' });

    expect(session.toolCallCount).toBe(1);
    expect(session.activeTools.has('Bash')).toBe(true);
    expect(session.lastToolName).toBe('Bash');
    expect(session.isFirstMessage).toBe(false);

    sessionManager.completeTool(sessionId, 'Bash');

    expect(session.activeTools.has('Bash')).toBe(false);
    expect(session.completedTools.has('Bash')).toBe(true);
  });

  test('detects Task tool as subagent', () => {
    const sessionId = 'test-session-4';
    const session = sessionManager.initSession(sessionId);

    sessionManager.startTool(sessionId, 'Task', { description: 'test task' });

    expect(session.hasSubagent).toBe(true);
    expect(session.subagentCallId).toBeDefined();

    sessionManager.completeTool(sessionId, 'Task');

    expect(session.subagentStopHookActive).toBe(true);
    expect(session.hasSubagent).toBe(false);
  });

  test('tracks responding state', () => {
    const sessionId = 'test-session-5';
    const session = sessionManager.initSession(sessionId);

    sessionManager.setResponding(sessionId, true);
    expect(session.isResponding).toBe(true);

    sessionManager.setResponding(sessionId, false);
    expect(session.isResponding).toBe(false);

    // Should trigger stop hook check
    session.messageCount = 1; // Simulate having processed a message
    sessionManager.setResponding(sessionId, false);
    expect(session.stopHookActive).toBe(true);
  });

  test('handles user messages', () => {
    const sessionId = 'test-session-6';
    const session = sessionManager.initSession(sessionId);

    sessionManager.handleUserMessage(sessionId);

    expect(session.messageCount).toBe(1);
    expect(session.isResponding).toBe(true);
  });

  test('builds correct SessionStart event', () => {
    const sessionId = 'test-session-7';
    sessionManager.initSession(sessionId, 'startup');

    const event = sessionManager.buildSessionStartEvent(sessionId);

    expect(event.hook_event_name).toBe('SessionStart');
    expect(event.session_id).toBe(sessionId);
    expect(event.transcript_path).toBe(`${mockTranscriptPath}/${sessionId}.json`);
    expect(event.cwd).toBe(mockCwd);
    expect(event.source).toBe('startup');
  });

  test('builds correct SessionEnd event', () => {
    const sessionId = 'test-session-8';
    sessionManager.initSession(sessionId);
    sessionManager.endSession(sessionId, 'idle');

    const event = sessionManager.buildSessionEndEvent(sessionId);

    expect(event.hook_event_name).toBe('SessionEnd');
    expect(event.session_id).toBe(sessionId);
    expect(event.reason).toBe('idle');
  });

  test('builds correct Stop event', () => {
    const sessionId = 'test-session-9';
    const session = sessionManager.initSession(sessionId);
    session.stopHookActive = true;

    const event = sessionManager.buildStopEvent(sessionId);

    expect(event.hook_event_name).toBe('Stop');
    expect(event.session_id).toBe(sessionId);
    expect(event.stop_hook_active).toBe(true);
  });

  test('builds correct SubagentStop event', () => {
    const sessionId = 'test-session-10';
    const session = sessionManager.initSession(sessionId);
    session.subagentStopHookActive = true;

    const event = sessionManager.buildSubagentStopEvent(sessionId);

    expect(event.hook_event_name).toBe('SubagentStop');
    expect(event.session_id).toBe(sessionId);
    expect(event.stop_hook_active).toBe(true);
  });

  test('cleans up sessions on dispose', () => {
    const sessionId1 = 'test-session-11';
    const sessionId2 = 'test-session-12';

    sessionManager.initSession(sessionId1);
    sessionManager.initSession(sessionId2);

    expect(sessionManager.getActiveSessions().length).toBe(2);

    sessionManager.dispose();

    expect(sessionManager.getActiveSessions().length).toBe(0);
  });

  test('handles session end with error details', () => {
    const sessionId = 'test-session-13';
    const session = sessionManager.initSession(sessionId);
    const error = new Error('Test error');

    sessionManager.endSession(sessionId, 'error', error);

    expect(session.endReason).toBe('error');
    expect(session.errorDetails).toBe(error);
  });
});
