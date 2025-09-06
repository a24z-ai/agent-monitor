#!/usr/bin/env node

const http = require('http');

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/agent-monitor') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        console.log('🔔 Agent Monitor Event:', event.type, {
          tool: event.tool,
          sessionID: event.sessionID,
          timestamp: new Date(event.timestamp).toLocaleTimeString(),
        });

        // For tool.pre_execute, we need to respond with block decision
        if (event.type === 'tool.pre_execute') {
          const shouldBlock = false; // Allow all tools for testing

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              block: shouldBlock,
              reason: shouldBlock ? 'Test blocking' : undefined,
            })
          );

          console.log(`   → ${shouldBlock ? '❌ BLOCKED' : '✅ ALLOWED'} tool: ${event.tool}`);
        } else {
          // Non-blocking events
          res.writeHead(200);
          res.end('OK');
        }
      } catch (error) {
        console.error('❌ Parse error:', error.message);
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(37123, 'localhost', () => {
  console.log('🚀 Test Agent Monitor server running on http://localhost:37123');
  console.log('📡 Waiting for events from OpenCode plugin...');
  console.log('Press Ctrl+C to stop');
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down test server');
  server.close();
  process.exit(0);
});
