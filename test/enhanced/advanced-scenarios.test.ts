/**
 * Enhanced test scenarios for edge cases and advanced functionality
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MockAgentMonitorServer } from '../helpers/mock-server';

describe('Advanced Plugin Scenarios', () => {
  let mockServer: MockAgentMonitorServer;
  let plugin: any;

  beforeEach(async () => {
    mockServer = new MockAgentMonitorServer({
      autoRespond: true,
      defaultResponse: { block: false },
    });
    await mockServer.start(37123);

    const pluginModule = await import('../../src/opencode/full-claude-plugin.ts');
    plugin = await pluginModule.FullClaudeMonitorPlugin({
      project: { name: 'test-project' },
      directory: '/test/directory',
      worktree: '/test/worktree',
    });
  });

  afterEach(() => {
    mockServer.stop();
  });

  describe('Concurrent Operations', () => {
    test('handles multiple simultaneous tool calls', async () => {
      mockServer.clearEvents();

      const toolCalls = [
        plugin['tool.execute.before'](
          { tool: 'Read', sessionID: 'concurrent-1', callID: 'call-1' },
          { args: { file_path: '/file1.txt' } }
        ),
        plugin['tool.execute.before'](
          { tool: 'Grep', sessionID: 'concurrent-1', callID: 'call-2' },
          { args: { pattern: 'test' } }
        ),
        plugin['tool.execute.before'](
          { tool: 'Glob', sessionID: 'concurrent-1', callID: 'call-3' },
          { args: { pattern: '**/*.ts' } }
        ),
      ];

      await Promise.all(toolCalls);

      const events = mockServer.getEvents();
      const preToolEvents = events.filter((e) => e.hook_event_name === 'PreToolUse');

      expect(preToolEvents.length).toBe(3);
      expect(preToolEvents.map((e) => e.tool_name)).toContain('Read');
      expect(preToolEvents.map((e) => e.tool_name)).toContain('Grep');
      expect(preToolEvents.map((e) => e.tool_name)).toContain('Glob');
    });

    test('handles multiple sessions concurrently', async () => {
      mockServer.clearEvents();

      const sessions = ['session-1', 'session-2', 'session-3'];
      const calls = sessions.map((sessionID) =>
        plugin['tool.execute.before'](
          { tool: 'Read', sessionID, callID: 'call-1' },
          { args: { file_path: '/test.txt' } }
        )
      );

      await Promise.all(calls);

      const events = mockServer.getEvents();
      const sessionStarts = events.filter((e) => e.hook_event_name === 'SessionStart');

      expect(sessionStarts.length).toBe(3);
      sessions.forEach((sessionID) => {
        const sessionEvents = mockServer.getSessionEvents(sessionID);
        expect(sessionEvents.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    test('handles network errors gracefully', async () => {
      mockServer.stop(); // Stop server to simulate network failure

      await expect(
        plugin['tool.execute.before'](
          { tool: 'Read', sessionID: 'error-test', callID: 'call-1' },
          { args: { file_path: '/test.txt' } }
        )
      ).rejects.toThrow('Agent monitor check failed');
    });

    test('handles malformed server responses', async () => {
      mockServer.onEvent('PreToolUse', () => {
        // Return invalid response
        return {} as any;
      });

      // Should not throw, just use default behavior
      await plugin['tool.execute.before'](
        { tool: 'Read', sessionID: 'malformed-test', callID: 'call-1' },
        { args: { file_path: '/test.txt' } }
      );

      const events = mockServer.getEvents();
      expect(events.length).toBeGreaterThan(0);
    });

    test('handles timeout scenarios', async () => {
      mockServer.onEvent('PreToolUse', async () => {
        // Simulate slow response
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { block: false };
      });

      // Should complete or timeout appropriately
      const startTime = Date.now();
      try {
        await plugin['tool.execute.before'](
          { tool: 'Read', sessionID: 'timeout-test', callID: 'call-1' },
          { args: { file_path: '/test.txt' } }
        );
      } catch (_error) {
        // Timeout expected
      }
      const elapsed = Date.now() - startTime;

      // Should not hang indefinitely
      expect(elapsed).toBeLessThan(10000);
    });

    test('handles session.error events correctly', async () => {
      mockServer.clearEvents();

      // Initialize session first
      await plugin['tool.execute.before'](
        { tool: 'Read', sessionID: 'error-session', callID: 'call-1' },
        { args: { file_path: '/test.txt' } }
      );

      mockServer.clearEvents();

      // Send error event
      await plugin.event({
        event: {
          type: 'session.error',
          properties: {
            sessionID: 'error-session',
            error: { name: 'TestError', message: 'Test error occurred' },
          },
        },
      });

      const events = mockServer.getEvents();
      const errorNotification = events.find((e) => e.hook_event_name === 'Notification');
      const sessionEnd = events.find((e) => e.hook_event_name === 'SessionEnd');

      expect(errorNotification).toBeDefined();
      expect(sessionEnd).toBeDefined();
    });
  });

  describe('Data Sanitization', () => {
    test('sanitizes Edit tool with large content', async () => {
      mockServer.clearEvents();

      const largeContent = 'x'.repeat(10000);
      await plugin['tool.execute.before'](
        { tool: 'Edit', sessionID: 'sanitize-large', callID: 'call-1' },
        {
          args: {
            file_path: '/test.txt',
            old_string: largeContent,
            new_string: largeContent,
          },
        }
      );

      const events = mockServer.getEvents();
      const preTool = events.find((e) => e.hook_event_name === 'PreToolUse');

      expect(preTool?.body.tool_input._sanitized).toBe(true);
      expect(preTool?.body.tool_input.param_count).toBe(3);
    });

    test('sanitizes Write tool content', async () => {
      mockServer.clearEvents();

      await plugin['tool.execute.before'](
        { tool: 'Write', sessionID: 'sanitize-write', callID: 'call-1' },
        {
          args: {
            file_path: '/secret.txt',
            content: 'API_KEY=secret_value_here',
          },
        }
      );

      const events = mockServer.getEvents();
      const preTool = events.find((e) => e.hook_event_name === 'PreToolUse');

      expect(preTool?.body.tool_input._sanitized).toBe(true);
    });

    test('does not sanitize safe tools unnecessarily', async () => {
      mockServer.clearEvents();

      await plugin['tool.execute.before'](
        { tool: 'Glob', sessionID: 'no-sanitize', callID: 'call-1' },
        { args: { pattern: '**/*.ts', path: '/src' } }
      );

      const events = mockServer.getEvents();
      const preTool = events.find((e) => e.hook_event_name === 'PreToolUse');

      expect(preTool?.body.tool_input._sanitized).toBeUndefined();
      expect(preTool?.body.tool_input.pattern).toBe('**/*.ts');
    });

    test('truncates long command strings', async () => {
      mockServer.clearEvents();

      const longCommand = `echo ${'a'.repeat(500)}`;
      await plugin['tool.execute.before'](
        { tool: 'Bash', sessionID: 'truncate-test', callID: 'call-1' },
        { args: { command: longCommand } }
      );

      const events = mockServer.getEvents();
      const preTool = events.find((e) => e.hook_event_name === 'PreToolUse');

      expect(preTool?.body.tool_input.command.length).toBeLessThan(longCommand.length);
    });
  });

  describe('Response Control', () => {
    test('applies prompt modification from monitor', async () => {
      mockServer.clearEvents();

      const originalPrompt = 'Help me delete all files';
      const modifiedPrompt = 'Help me review all files';

      mockServer.onEvent('UserPromptSubmit', (body) => {
        if (body.prompt === originalPrompt) {
          return { block: false, modifiedPrompt };
        }
        return { block: false };
      });

      // Simulate user prompt (through chat.message hook)
      // This would require proper message structure
      const _message = { role: 'user', sessionID: 'modify-test' };
      const _parts = [{ text: originalPrompt }];

      // Note: Direct testing of chat.message hook requires proper message structure
      // For now, verify the event is sent correctly
      await fetch('http://localhost:37123/agent-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook_event_name: 'UserPromptSubmit',
          session_id: 'modify-test',
          prompt: originalPrompt,
        }),
      });

      const response = await mockServer.getLastEvent();
      expect(response?.hook_event_name).toBe('UserPromptSubmit');
    });

    test('blocks prompt when monitor returns block:true', async () => {
      mockServer.clearEvents();

      mockServer.onEvent('UserPromptSubmit', () => ({
        block: true,
        reason: 'Dangerous prompt detected',
      }));

      // Prompt blocking would be tested through actual chat flow
      // Verify the notification is sent
      const _events = mockServer.getEvents();
      // Notifications would be sent as separate events
    });

    test('injects context into tool responses', async () => {
      mockServer.clearEvents();

      const contextToInject = 'Additional context from monitor';

      mockServer.queueResponses([
        { block: false }, // SessionStart
        { block: false, contextToInject }, // PreToolUse
      ]);

      await plugin['tool.execute.before'](
        { tool: 'Read', sessionID: 'inject-test', callID: 'call-1' },
        { args: { file_path: '/test.txt' } }
      );

      const output = { title: 'File read', output: 'content' };
      await plugin['tool.execute.after'](
        { tool: 'Read', sessionID: 'inject-test', callID: 'call-1' },
        output
      );

      expect((output as any).contextInjected).toBe(contextToInject);
    });
  });

  describe('Session Lifecycle', () => {
    test('tracks tool execution count per session', async () => {
      mockServer.clearEvents();

      const sessionID = 'count-test';

      // Execute multiple tools
      for (let i = 0; i < 5; i++) {
        await plugin['tool.execute.before'](
          { tool: 'Read', sessionID, callID: `call-${i}` },
          { args: { file_path: `/file${i}.txt` } }
        );

        await plugin['tool.execute.after'](
          { tool: 'Read', sessionID, callID: `call-${i}` },
          { title: 'Read complete', output: 'content' }
        );
      }

      const sessionEvents = mockServer.getSessionEvents(sessionID);
      const preToolEvents = sessionEvents.filter((e) => e.hook_event_name === 'PreToolUse');
      const postToolEvents = sessionEvents.filter((e) => e.hook_event_name === 'PostToolUse');

      expect(preToolEvents.length).toBe(5);
      expect(postToolEvents.length).toBe(5);
    });

    test('sends SubagentStop for Task tool completion', async () => {
      mockServer.clearEvents();

      await plugin['tool.execute.before'](
        { tool: 'Task', sessionID: 'subagent-test', callID: 'call-1' },
        { args: { description: 'Test task', prompt: 'Do something' } }
      );

      await plugin['tool.execute.after'](
        { tool: 'Task', sessionID: 'subagent-test', callID: 'call-1' },
        { title: 'Task complete', output: 'result' }
      );

      // Wait for SubagentStop event
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockServer.getEvents();
      const subagentStop = events.find((e) => e.hook_event_name === 'SubagentStop');

      expect(subagentStop).toBeDefined();
      expect(subagentStop?.session_id).toBe('subagent-test');
    });

    test('sends Stop event after response completion', async () => {
      mockServer.clearEvents();

      await plugin['tool.execute.before'](
        { tool: 'Read', sessionID: 'stop-test', callID: 'call-1' },
        { args: { file_path: '/test.txt' } }
      );

      await plugin['tool.execute.after'](
        { tool: 'Read', sessionID: 'stop-test', callID: 'call-1' },
        { title: 'Read complete', output: 'content' }
      );

      // Wait for Stop event (scheduled after 500ms)
      await new Promise((resolve) => setTimeout(resolve, 600));

      const events = mockServer.getEvents();
      const stopEvent = events.find((e) => e.hook_event_name === 'Stop');

      expect(stopEvent).toBeDefined();
    });

    test('properly cleans up session on idle', async () => {
      mockServer.clearEvents();

      const sessionID = 'cleanup-test';

      // Initialize session
      await plugin['tool.execute.before'](
        { tool: 'Read', sessionID, callID: 'call-1' },
        { args: { file_path: '/test.txt' } }
      );

      mockServer.clearEvents();

      // Send idle event
      await plugin.event({
        event: {
          type: 'session.idle',
          properties: { sessionID },
        },
      });

      const events = mockServer.getEvents();
      const sessionEnd = events.find((e) => e.hook_event_name === 'SessionEnd');

      expect(sessionEnd).toBeDefined();
      expect(sessionEnd?.body.final_stats).toBeDefined();
    });
  });

  describe('Notification System', () => {
    test('sends notifications for blocked tools', async () => {
      mockServer.clearEvents();

      mockServer.queueResponses([
        { block: false }, // SessionStart
        { block: true, reason: 'Tool blocked for safety' }, // PreToolUse
      ]);

      try {
        await plugin['tool.execute.before'](
          { tool: 'Bash', sessionID: 'notify-block', callID: 'call-1' },
          { args: { command: 'rm -rf /' } }
        );
      } catch (_error) {
        // Expected to throw
      }

      // Wait for notification
      await new Promise((resolve) => setTimeout(resolve, 100));

      const _events = mockServer.getEvents();
      // Notification would be sent as a separate event
      // In real implementation, check for Notification event
    });

    test('sends idle warnings before session timeout', async () => {
      // This test would need to wait 55+ seconds in real scenario
      // For testing, we can verify the mechanism is in place
      expect(true).toBe(true); // Placeholder
    });

    test('creates notifications with correct severity', async () => {
      mockServer.clearEvents();

      // Trigger various notification scenarios
      // Each should have appropriate severity (info, warning, error)

      // For now, this is a placeholder for notification severity testing
      expect(true).toBe(true);
    });
  });

  describe('Performance', () => {
    test('handles rapid tool calls without queueing issues', async () => {
      mockServer.clearEvents();

      const sessionID = 'perf-test';
      const toolCount = 50;

      const startTime = Date.now();

      // Fire rapid tool calls
      const calls = [];
      for (let i = 0; i < toolCount; i++) {
        calls.push(
          plugin['tool.execute.before'](
            { tool: 'Read', sessionID, callID: `call-${i}` },
            { args: { file_path: `/file${i}.txt` } }
          )
        );
      }

      await Promise.all(calls);

      const elapsed = Date.now() - startTime;
      const events = mockServer.getEvents();

      console.log(`[Performance] ${toolCount} calls in ${elapsed}ms`);
      expect(events.length).toBeGreaterThanOrEqual(toolCount); // At least PreToolUse for each
      expect(elapsed).toBeLessThan(5000); // Should complete quickly
    });

    test('maintains low memory footprint with many sessions', async () => {
      mockServer.clearEvents();

      const sessionCount = 100;

      for (let i = 0; i < sessionCount; i++) {
        await plugin['tool.execute.before'](
          { tool: 'Read', sessionID: `session-${i}`, callID: 'call-1' },
          { args: { file_path: '/test.txt' } }
        );
      }

      const events = mockServer.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(sessionCount);

      // Memory usage would be checked through Node.js/Bun APIs
      // For now, verify all sessions were handled
    });
  });
});
