#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Plugin configuration
const PLUGIN_NAME = 'agent-monitor.js';
const SOURCE_FILE = path.join(__dirname, 'src', 'opencode', 'http-sender.ts');

// Determine installation directory
const globalPluginDir = path.join(os.homedir(), '.config', 'opencode', 'plugin');
const localPluginDir = path.join(process.cwd(), '.opencode', 'plugin');

function install(isGlobal = true) {
  const targetDir = isGlobal ? globalPluginDir : localPluginDir;
  const targetFile = path.join(targetDir, PLUGIN_NAME);

  try {
    // Create directory if it doesn't exist
    fs.mkdirSync(targetDir, { recursive: true });

    // Read source file
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');

    // Write to target
    fs.writeFileSync(targetFile, content);

    console.log('✅ Agent Monitor plugin installed successfully!');
    console.log(`📍 Location: ${targetFile}`);
    console.log('');
    console.log('The plugin will:');
    console.log('  • Send tool call events to http://localhost:37123/agent-monitor');
    console.log('  • Block tool execution if the monitor service is unreachable');
    console.log('  • Block tools if the monitor responds with {block: true}');
    console.log('');
    console.log('⚠️  Make sure your VSCode extension is listening on port 37123');
  } catch (error) {
    console.error('❌ Installation failed:', error.message);
    process.exit(1);
  }
}

function uninstall(isGlobal = true) {
  const targetDir = isGlobal ? globalPluginDir : localPluginDir;
  const targetFile = path.join(targetDir, PLUGIN_NAME);

  try {
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
      console.log('✅ Agent Monitor plugin uninstalled');
    } else {
      console.log('ℹ️  Plugin not found at:', targetFile);
    }
  } catch (error) {
    console.error('❌ Uninstall failed:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'install';
const isLocal = args.includes('--local');

switch (command) {
  case 'install':
    install(!isLocal);
    break;
  case 'uninstall':
    uninstall(!isLocal);
    break;
  default:
    console.log('Usage: node install.js [install|uninstall] [--local]');
    console.log('');
    console.log('Commands:');
    console.log('  install    Install the plugin (default)');
    console.log('  uninstall  Remove the plugin');
    console.log('');
    console.log('Options:');
    console.log('  --local    Install to current project instead of globally');
    process.exit(1);
}
