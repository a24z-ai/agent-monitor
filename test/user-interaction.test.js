import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { NotificationType, UserInteractionHandler } from '../src/services/user-interaction-handler';

describe('User Interaction Handler', () => {
  let handler;
  const mockCwd = '/test/directory';
  const mockTranscriptPath = '/test/transcripts';

  beforeEach(() => {
    handler = new UserInteractionHandler(mockCwd, mockTranscriptPath);
  });

  afterEach(() => {
    handler.dispose();
  });

  describe('Prompt Processing', () => {
    test('processes user prompt with metadata', () => {
      const sessionId = 'test-session-1';
      const prompt = 'Create a new React component with TypeScript';

      const metadata = handler.processUserPrompt(sessionId, prompt);

      expect(metadata.sessionId).toBe(sessionId);
      expect(metadata.originalPrompt).toBe(prompt);
      expect(metadata.wasBlocked).toBe(false);
      expect(metadata.characterCount).toBe(prompt.length);
      expect(metadata.wordCount).toBe(6);
      expect(metadata.hasCodeBlocks).toBe(false);
      expect(metadata.hasUrls).toBe(false);
      expect(metadata.sentiment).toBe('command');
    });

    test('detects code blocks in prompt', () => {
      const prompt = 'Here is my code:\n```js\nconsole.log("test")\n```';
      const metadata = handler.processUserPrompt('session-1', prompt);

      expect(metadata.hasCodeBlocks).toBe(true);
    });

    test('detects URLs in prompt', () => {
      const prompt = 'Check this: https://example.com/docs';
      const metadata = handler.processUserPrompt('session-1', prompt);

      expect(metadata.hasUrls).toBe(true);
    });

    test('analyzes sentiment correctly', () => {
      const commands = ['Create a function', 'Build the app', 'Fix the bug'];
      const negative = ["This doesn't work", 'Found an error', 'Something failed'];
      const positive = ['Great job!', 'This is excellent', 'Thanks for the help'];
      const neutral = ['What is this?', 'How do I do this?', 'Please explain'];

      for (const cmd of commands) {
        expect(handler.processUserPrompt('s1', cmd).sentiment).toBe('command');
      }

      for (const neg of negative) {
        expect(handler.processUserPrompt('s2', neg).sentiment).toBe('negative');
      }

      for (const pos of positive) {
        expect(handler.processUserPrompt('s3', pos).sentiment).toBe('positive');
      }

      for (const neu of neutral) {
        expect(handler.processUserPrompt('s4', neu).sentiment).toBe('neutral');
      }
    });

    test('handles prompt blocking', () => {
      const sessionId = 'test-session-2';
      const prompt = 'Delete all files';
      const control = {
        block: true,
        reason: 'Dangerous operation detected',
      };

      const metadata = handler.processUserPrompt(sessionId, prompt, control);

      expect(metadata.wasBlocked).toBe(true);
      expect(metadata.blockReason).toBe('Dangerous operation detected');
    });

    test('handles prompt modification', () => {
      const sessionId = 'test-session-3';
      const prompt = 'Original prompt';
      const control = {
        block: false,
        modifiedPrompt: 'Modified prompt with safety checks',
      };

      const metadata = handler.processUserPrompt(sessionId, prompt, control);

      expect(metadata.wasBlocked).toBe(false);
      expect(metadata.modifiedPrompt).toBe('Modified prompt with safety checks');
      expect(metadata.originalPrompt).toBe('Original prompt');
    });

    test('handles context injection', () => {
      const sessionId = 'test-session-4';
      const prompt = 'Write a function';
      const control = {
        block: false,
        contextToInject: 'Remember to follow coding standards',
      };

      const metadata = handler.processUserPrompt(sessionId, prompt, control);

      expect(metadata.contextInjected).toBe('Remember to follow coding standards');
    });
  });

  describe('Notifications', () => {
    test('creates notification with correct properties', () => {
      const sessionId = 'test-session-5';
      const notification = handler.createNotification(
        sessionId,
        NotificationType.PERMISSION_NEEDED,
        'Permission required for file access',
        'warning'
      );

      expect(notification.sessionId).toBe(sessionId);
      expect(notification.type).toBe(NotificationType.PERMISSION_NEEDED);
      expect(notification.message).toBe('Permission required for file access');
      expect(notification.severity).toBe('warning');
      expect(notification.requiresAction).toBe(false); // warning doesn't require action
      expect(notification.dismissed).toBe(false);
    });

    test('error notifications require action', () => {
      const notification = handler.createNotification(
        'session-1',
        NotificationType.ERROR_OCCURRED,
        'An error occurred',
        'error'
      );

      expect(notification.requiresAction).toBe(true);
    });

    test('critical notifications require action', () => {
      const notification = handler.createNotification(
        'session-1',
        NotificationType.RATE_LIMITED,
        'Rate limit exceeded',
        'critical'
      );

      expect(notification.requiresAction).toBe(true);
    });

    test('dismisses notification correctly', () => {
      const sessionId = 'test-session-6';
      const notification = handler.createNotification(
        sessionId,
        NotificationType.TOOL_BLOCKED,
        'Tool was blocked',
        'warning'
      );

      handler.dismissNotification(notification.notificationId, 'User acknowledged');

      expect(notification.dismissed).toBe(true);
      expect(notification.actionTaken).toBe('User acknowledged');
    });

    test('gets pending notifications for session', () => {
      const sessionId = 'test-session-7';

      // Create multiple notifications
      handler.createNotification(
        sessionId,
        NotificationType.IDLE_WARNING,
        'Idle warning',
        'warning'
      );
      handler.createNotification(sessionId, NotificationType.ERROR_OCCURRED, 'Error', 'error');
      handler.createNotification('other-session', NotificationType.CUSTOM, 'Other', 'info');

      const pending = handler.getPendingNotifications(sessionId);

      expect(pending.length).toBe(1); // Only error requires action
      expect(pending[0].type).toBe(NotificationType.ERROR_OCCURRED);
    });
  });

  describe('Prompt Triggers', () => {
    test('detects dangerous commands', () => {
      const dangerous = ['rm -rf /', 'format c:', 'delete all records', 'drop database production'];

      for (const prompt of dangerous) {
        const trigger = handler.checkPromptTriggers(prompt);
        expect(trigger).toBe(NotificationType.PERMISSION_NEEDED);
      }
    });

    test('detects sensitive information', () => {
      const sensitive = [
        'Here is my API key: xyz123',
        'The password is secret123',
        'Store this secret value',
        'My credentials are...',
      ];

      for (const prompt of sensitive) {
        const trigger = handler.checkPromptTriggers(prompt);
        expect(trigger).toBe(NotificationType.TOOL_BLOCKED);
      }
    });

    test('detects context-heavy requests', () => {
      const longPrompt = 'a'.repeat(10001);
      const trigger = handler.checkPromptTriggers(longPrompt);
      expect(trigger).toBe(NotificationType.CONTEXT_LIMIT);
    });

    test('returns null for safe prompts', () => {
      const safe = ['Create a simple function', 'Explain this code', 'Help me debug'];

      for (const prompt of safe) {
        const trigger = handler.checkPromptTriggers(prompt);
        expect(trigger).toBeNull();
      }
    });
  });

  describe('Session Management', () => {
    test('maintains prompt history', () => {
      const sessionId = 'test-session-8';

      handler.processUserPrompt(sessionId, 'First prompt');
      handler.processUserPrompt(sessionId, 'Second prompt');
      handler.processUserPrompt(sessionId, 'Third prompt');

      const history = handler.getPromptHistory(sessionId);

      expect(history.length).toBe(3);
      expect(history[0].originalPrompt).toBe('First prompt');
      expect(history[2].originalPrompt).toBe('Third prompt');
    });

    test('limits history size', () => {
      const sessionId = 'test-session-9';

      // Process more than max history size (100)
      for (let i = 0; i < 105; i++) {
        handler.processUserPrompt(sessionId, `Prompt ${i}`);
      }

      const history = handler.getPromptHistory(sessionId);
      expect(history.length).toBe(100);
      expect(history[0].originalPrompt).toBe('Prompt 5'); // First 5 removed
    });

    test('calculates session statistics', () => {
      const sessionId = 'test-session-10';

      // Process various prompts
      handler.processUserPrompt(sessionId, 'Create a function');
      handler.processUserPrompt(sessionId, 'This is broken', { block: true, reason: 'Test' });
      handler.processUserPrompt(sessionId, 'Great work!');
      handler.processUserPrompt(sessionId, 'Check https://example.com');
      handler.processUserPrompt(sessionId, 'Code:\n```js\ntest\n```');

      const stats = handler.getSessionStats(sessionId);

      expect(stats.totalPrompts).toBe(5);
      expect(stats.blockedPrompts).toBe(1);
      expect(stats.codeBlockCount).toBe(1);
      expect(stats.urlCount).toBe(1);
      expect(stats.sentimentBreakdown.command).toBe(1);
      expect(stats.sentimentBreakdown.negative).toBe(1);
      expect(stats.sentimentBreakdown.positive).toBe(1);
      expect(stats.sentimentBreakdown.neutral).toBe(2);
    });

    test('clears session data', () => {
      const sessionId = 'test-session-11';

      handler.processUserPrompt(sessionId, 'Test prompt');
      handler.createNotification(sessionId, NotificationType.CUSTOM, 'Test', 'info');

      handler.clearSession(sessionId);

      expect(handler.getPromptHistory(sessionId).length).toBe(0);
      expect(handler.getPendingNotifications(sessionId).length).toBe(0);
    });
  });

  describe('Event Building', () => {
    test('builds UserPromptSubmit event correctly', () => {
      const event = handler.buildUserPromptSubmitEvent(
        'session-1',
        'Test prompt',
        '/test/transcript.json'
      );

      expect(event.hook_event_name).toBe('UserPromptSubmit');
      expect(event.session_id).toBe('session-1');
      expect(event.transcript_path).toBe('/test/transcript.json');
      expect(event.cwd).toBe(mockCwd);
      expect(event.prompt).toBe('Test prompt');
    });

    test('builds Notification event correctly', () => {
      const event = handler.buildNotificationEvent(
        'session-1',
        'Test notification',
        '/test/transcript.json'
      );

      expect(event.hook_event_name).toBe('Notification');
      expect(event.session_id).toBe('session-1');
      expect(event.transcript_path).toBe('/test/transcript.json');
      expect(event.cwd).toBe(mockCwd);
      expect(event.message).toBe('Test notification');
    });
  });
});
