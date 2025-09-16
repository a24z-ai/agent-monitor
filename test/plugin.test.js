import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock fetch globally
global.fetch = mock();

describe('Agent Monitor Plugin', () => {
  let mockProject, mockDirectory, mockWorktree;
  let plugin;

  beforeEach(async () => {
    // Reset fetch mock
    fetch.mockClear();

    // Setup mock context
    mockProject = { name: 'test-project' };
    mockDirectory = '/test/directory';
    mockWorktree = '/test/worktree';

    // Import plugin fresh each test
    const pluginModule = await import('../src/opencode/http-sender.ts');
    plugin = await pluginModule.AgentMonitorPlugin({
      project: mockProject,
      directory: mockDirectory,
      worktree: mockWorktree,
    });
  });

  afterEach(() => {
    // Clean up any global state
    if (typeof global.sessions !== 'undefined') {
      global.sessions = undefined;
    }
  });

  test('plugin exports correct structure', () => {
    expect(plugin).toHaveProperty('tool.execute.before');
    expect(plugin).toHaveProperty('tool.execute.after');
    expect(plugin).toHaveProperty('event');
    expect(typeof plugin['tool.execute.before']).toBe('function');
    expect(typeof plugin['tool.execute.after']).toBe('function');
    expect(typeof plugin.event).toBe('function');
  });

  test('tool.execute.before sends correct event and allows execution', async () => {
    // Mock successful response
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ block: false }),
    });

    const input = {
      tool: 'bash',
      sessionID: 'test-session',
      callID: 'test-call',
    };
    const output = {
      args: {
        command: 'ls -la',
        filePath: '/test/file.txt',
      },
    };

    const result = await plugin['tool.execute.before'](input, output);

    // Should return the output unchanged
    expect(result).toBe(output);

    // Should have made HTTP requests
    expect(fetch).toHaveBeenCalledTimes(2); // session.started + tool.pre_execute

    // Check the tool.pre_execute call
    const toolCall = fetch.mock.calls.find((call) => {
      const body = JSON.parse(call[1].body);
      return body.type === 'tool.pre_execute';
    });

    expect(toolCall).toBeDefined();
    const eventData = JSON.parse(toolCall[1].body);
    expect(eventData).toMatchObject({
      type: 'tool.pre_execute',
      tool: 'bash',
      sessionID: 'test-session',
      callID: 'test-call',
      project: 'test-project',
      directory: '/test/directory',
      worktree: '/test/worktree',
    });
  });

  test('tool.execute.before blocks execution when service returns block:true', async () => {
    // Mock blocking response
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ block: false }), // session.started
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ block: true, reason: 'Test block' }), // tool.pre_execute
    });

    const input = {
      tool: 'bash',
      sessionID: 'test-session',
      callID: 'test-call',
    };
    const output = { args: { command: 'rm -rf /' } };

    await expect(plugin['tool.execute.before'](input, output)).rejects.toThrow('Test block');
  });

  test('tool.execute.before blocks execution when service is unreachable', async () => {
    // Mock network failure
    fetch.mockRejectedValue(new Error('Connection refused'));

    const input = {
      tool: 'bash',
      sessionID: 'test-session',
      callID: 'test-call',
    };
    const output = { args: { command: 'ls' } };

    await expect(plugin['tool.execute.before'](input, output)).rejects.toThrow(
      'Agent monitor check failed'
    );
  });

  test('tool.execute.after sends post-execution event', async () => {
    // Mock successful response
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const input = {
      tool: 'bash',
      sessionID: 'test-session',
      callID: 'test-call',
    };
    const output = {
      title: 'Command executed',
      output: 'command output here',
      metadata: { exitCode: 0 },
    };

    const result = await plugin['tool.execute.after'](input, output);

    expect(result).toBe(output);
    expect(fetch).toHaveBeenCalledWith('http://localhost:37123/agent-monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('tool.post_execute'),
    });

    const eventData = JSON.parse(fetch.mock.calls[0][1].body);
    expect(eventData).toMatchObject({
      type: 'tool.post_execute',
      tool: 'bash',
      sessionID: 'test-session',
      callID: 'test-call',
      title: 'Command executed',
      outputLength: 'command output here'.length,
      hasMetadata: true,
    });
  });

  test('event handler processes session.idle events', async () => {
    // First trigger a tool call to create session
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ block: false }),
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ block: false }),
    });

    await plugin['tool.execute.before'](
      { tool: 'read', sessionID: 'test-session', callID: 'call-1' },
      { args: { filePath: 'test.txt' } }
    );

    // Now send session.idle event
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const event = {
      type: 'session.idle',
      properties: { sessionID: 'test-session' },
    };

    await plugin.event({ event });

    // Should have sent session.idle event
    const idleCall = fetch.mock.calls.find((call) => {
      const body = JSON.parse(call[1].body);
      return body.type === 'session.idle';
    });

    expect(idleCall).toBeDefined();
    const eventData = JSON.parse(idleCall[1].body);
    expect(eventData).toMatchObject({
      type: 'session.idle',
      sessionID: 'test-session',
      finalStats: expect.objectContaining({
        totalToolCalls: 1,
        uniqueTools: ['read'],
      }),
    });
  });
});
