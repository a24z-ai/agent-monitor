// Basic HTTP event sender for OpenCode plugin
// Sends tool call events to VSCode extension endpoint

const VSCODE_PORT = 37123;
const VSCODE_HOST = 'localhost';
const ENDPOINT = `http://${VSCODE_HOST}:${VSCODE_PORT}/agent-monitor`;

// Export as a named function for OpenCode plugin system
export const AgentMonitorPlugin = async ({ project, directory, worktree }) => {
  console.log('[Agent Monitor] Plugin loaded, will send events to:', ENDPOINT);

  // Track session metrics
  const sessions = new Map();

  async function sendEvent(eventType, payload) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      project: project?.name || 'unknown',
      directory,
      worktree,
      ...payload,
    };

    // Log the event locally
    console.log('[Agent Monitor] Sending event:', eventType, {
      tool: payload.tool,
      sessionID: payload.sessionID,
    });

    // Send to VSCode extension
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Failed to send event: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  return {
    // Hook into tool execution
    'tool.execute.before': async (input, output) => {
      const { tool, sessionID, callID } = input;
      const { args } = output;

      try {
        // Initialize session tracking
        if (!sessions.has(sessionID)) {
          sessions.set(sessionID, {
            startTime: Date.now(),
            toolCallCount: 0,
            tools: new Set(),
          });

          await sendEvent('session.started', {
            sessionID,
            startTime: Date.now(),
          });
        }

        const session = sessions.get(sessionID);
        session.toolCallCount++;
        session.tools.add(tool);

        // Send pre-execution event - if this fails, block the tool
        const response = await sendEvent('tool.pre_execute', {
          tool,
          sessionID,
          callID,
          args: {
            // Send sanitized args (remove sensitive data)
            ...Object.keys(args).reduce((acc, key) => {
              // For now, just send keys and basic type info
              acc[key] = typeof args[key];
              return acc;
            }, {}),
            // Include some specific safe fields
            command: tool === 'bash' ? args.command?.substring(0, 100) : undefined,
            filePath: args.filePath,
            pattern: args.pattern,
          },
          sessionStats: {
            toolCallCount: session.toolCallCount,
            uniqueTools: session.tools.size,
            duration: Date.now() - session.startTime,
          },
        });

        // Check if the monitor service wants to block this call
        const result = await response.json();
        if (result.block) {
          throw new Error(result.reason || 'Tool call blocked by agent monitor');
        }
      } catch (error) {
        // If we can't reach the monitor or it rejects, block the tool call
        console.error('[Agent Monitor] Blocking tool call due to error:', error.message);
        throw new Error(`Agent monitor check failed: ${error.message}`);
      }

      return output;
    },

    // Hook into tool completion
    'tool.execute.after': async (input, output) => {
      const { tool, sessionID, callID } = input;

      try {
        // Send post-execution event
        await sendEvent('tool.post_execute', {
          tool,
          sessionID,
          callID,
          title: output.title,
          // Don't send full output to avoid sensitive data
          outputLength: output.output?.length || 0,
          hasMetadata: !!output.metadata,
        });
      } catch (error) {
        // Post-execution monitoring failures shouldn't affect the tool result
        console.error('[Agent Monitor] Failed to send post-execute event:', error.message);
      }

      return output;
    },

    // Monitor session lifecycle
    event: async ({ event }) => {
      try {
        if (event.type === 'session.idle') {
          const sessionID = event.properties?.sessionID;
          if (sessionID && sessions.has(sessionID)) {
            const session = sessions.get(sessionID);

            await sendEvent('session.idle', {
              sessionID,
              finalStats: {
                duration: Date.now() - session.startTime,
                totalToolCalls: session.toolCallCount,
                uniqueTools: Array.from(session.tools),
              },
            });

            // Clean up session data
            sessions.delete(sessionID);
          }
        } else if (event.type === 'session.error') {
          await sendEvent('session.error', {
            sessionID: event.properties?.sessionID,
            error: event.properties?.error?.name,
          });
        }
      } catch (error) {
        // Event monitoring failures are logged but don't throw
        console.error('[Agent Monitor] Failed to send event:', error.message);
      }
    },
  };
};
