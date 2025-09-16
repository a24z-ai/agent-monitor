#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const sourceFile = path.join(__dirname, 'src', 'opencode', 'discovery.js');
const pluginDir = path.join(os.homedir(), '.config', 'opencode', 'plugin');
const targetFile = path.join(pluginDir, 'agent-monitor-discovery.js');

// Create directory if it doesn't exist
fs.mkdirSync(pluginDir, { recursive: true });

// Copy plugin
const content = fs.readFileSync(sourceFile, 'utf8');
fs.writeFileSync(targetFile, content);

console.log('✅ Discovery plugin installed to:', targetFile);
console.log('📝 This plugin will log all available context data');
console.log('🔍 Check your OpenCode logs to see what data is available');
