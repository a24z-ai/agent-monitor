// Discovery plugin to explore available context and data
const { logger } = require('../utils/logger');

module.exports = ({ project, client, $, directory, worktree }) => {
  logger.log('[Agent Monitor] Plugin loaded with context:', {
    projectKeys: project ? Object.keys(project) : 'undefined',
    clientKeys: client ? Object.keys(client) : 'undefined',
    hasShell: !!$,
    directory,
    worktree,
  });

  return {
    'tool.execute.before': async (input, output) => {
      logger.log('[Agent Monitor] Tool call intercepted:', {
        tool: input.tool,
        inputKeys: Object.keys(input),
        outputKeys: Object.keys(output),
        fullInput: JSON.stringify(input, null, 2),
        argsPreview: output.args ? Object.keys(output.args) : 'no args',
      });

      // Log full details for first few calls to understand structure
      if (!global.agentMonitorLogCount) {
        global.agentMonitorLogCount = 0;
      }

      if (global.agentMonitorLogCount < 3) {
        logger.log('[Agent Monitor] Full details:', {
          input,
          output: JSON.stringify(output, null, 2),
        });
        global.agentMonitorLogCount++;
      }

      return output;
    },

    event: async ({ event }) => {
      logger.log('[Agent Monitor] Event received:', {
        type: event.type,
        eventKeys: Object.keys(event),
        fullEvent: JSON.stringify(event, null, 2),
      });

      // Check for session-related data
      if (event.session || event.sessionId || event.id) {
        logger.log('[Agent Monitor] Session info found:', {
          session: event.session,
          sessionId: event.sessionId,
          id: event.id,
        });
      }
    },
  };
};
