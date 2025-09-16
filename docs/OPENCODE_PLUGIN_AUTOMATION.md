# OpenCode Plugin Installation Automation

## Overview
Analysis of automating OpenCode plugin installation similar to how Claude and Gemini hooks are configured in the agent-manager system.

## Current Installation Methods Comparison

### Claude Hooks
- **Config Location**: `~/.claude/settings.json`
- **Installation Method**: JSON file manipulation
- **Automation**: Direct file write via Node.js
- **NPX Command**: `npx @principal-ai/agent-hooks claude-hook --enable`

### Gemini Hooks
- **Config Location**: `~/.gemini/settings.json`
- **Installation Method**: JSON file manipulation
- **Automation**: Direct file write via Node.js
- **NPX Command**: `npx @principal-ai/agent-hooks gemini-hook --enable`

### OpenCode Plugin (Current)
- **Config Location**: `~/.config/opencode/plugin/` or `.opencode/plugin/`
- **Installation Method**: Copy TypeScript file to plugin directory
- **Current Script**: `node install.js [install|uninstall] [--local]`
- **Automation**: File copy operation

## Automation Feasibility

### ✅ Highly Feasible Aspects

1. **Simple File Operations**
   - Plugin installation is just copying a file to a directory
   - No complex configuration merging required
   - Clear installation paths (global vs local)

2. **Consistent with Other Agents**
   - Similar pattern to Claude/Gemini (file system operations)
   - Can be packaged in same NPX tool
   - Uses same Node.js fs operations

3. **No Authentication Required**
   - Direct file system access
   - No API keys or credentials needed
   - Works offline

### 🎯 Implementation Approach

#### NPX Package Integration
```bash
# Future unified commands
npx @principal-ai/agent-hooks opencode-plugin --enable   # Install plugin
npx @principal-ai/agent-hooks opencode-plugin --disable  # Uninstall plugin
npx @principal-ai/agent-hooks opencode-plugin --status   # Check if installed
```

#### Programmatic Installation
```javascript
class OpenCodePluginInstaller {
  async enable() {
    const sourceFile = path.join(__dirname, 'plugins/opencode/agent-monitor.js');
    const targetDir = path.join(os.homedir(), '.config', 'opencode', 'plugin');
    const targetFile = path.join(targetDir, 'agent-monitor.js');

    // Create directory if needed
    await fs.mkdir(targetDir, { recursive: true });

    // Copy plugin file
    await fs.copyFile(sourceFile, targetFile);

    return { success: true, location: targetFile };
  }

  async disable() {
    const targetFile = path.join(os.homedir(), '.config', 'opencode', 'plugin', 'agent-monitor.js');

    if (await fs.exists(targetFile)) {
      await fs.unlink(targetFile);
      return { success: true };
    }

    return { success: false, error: 'Plugin not found' };
  }

  async status() {
    const globalPath = path.join(os.homedir(), '.config', 'opencode', 'plugin', 'agent-monitor.js');
    const localPath = path.join(process.cwd(), '.opencode', 'plugin', 'agent-monitor.js');

    return {
      globalInstalled: await fs.exists(globalPath),
      localInstalled: await fs.exists(localPath),
      paths: { global: globalPath, local: localPath }
    };
  }
}
```

## Integration with Agent Manager

### Unified Configuration Service
```javascript
// In @principal-ai/agent-hooks package
class AgentHooksManager {
  async configureAgent(agent, action) {
    switch(agent) {
      case 'claude':
        return this.configureClaudeHooks(action);
      case 'gemini':
        return this.configureGeminiHooks(action);
      case 'opencode':
        return this.configureOpenCodePlugin(action);
    }
  }

  async configureOpenCodePlugin(action) {
    const installer = new OpenCodePluginInstaller();

    switch(action) {
      case 'enable':
        return await installer.enable();
      case 'disable':
        return await installer.disable();
      case 'status':
        return await installer.status();
    }
  }
}
```

## Migration Path

### Phase 1: Standalone NPX Package
1. Create `@principal-ai/agent-hooks` package
2. Include OpenCode plugin file in package
3. Implement installation logic
4. Test with all three agents

### Phase 2: VS Code Extension Integration
1. Extension calls NPX package programmatically
2. UI shows unified status for all agents
3. Single "Enable Monitoring" button configures all

### Phase 3: Advanced Features
1. Auto-detection of installed agents
2. Version compatibility checking
3. Update notifications
4. Rollback capability

## Advantages of Plugin vs Hook Approach

### OpenCode Plugin Benefits
1. **Richer Integration**: Full access to OpenCode API
2. **Better Performance**: Runs in-process, not as subprocess
3. **Type Safety**: TypeScript support with types
4. **Event Variety**: Access to more event types

### Hook System Benefits (Claude/Gemini)
1. **Language Agnostic**: Can be written in any language
2. **Process Isolation**: Crashes don't affect agent
3. **Simple Protocol**: Just stdin/stdout/exit codes

## Technical Considerations

### File Permissions
- Ensure write access to `~/.config/opencode/plugin/`
- Handle permission errors gracefully
- Provide clear error messages

### Version Management
- Track plugin version in metadata
- Support updating existing installations
- Maintain backwards compatibility

### Error Handling
```javascript
try {
  await installer.enable();
} catch (error) {
  if (error.code === 'EACCES') {
    console.error('Permission denied. Try running with elevated privileges.');
  } else if (error.code === 'ENOENT') {
    console.error('OpenCode directory not found. Is OpenCode installed?');
  } else {
    console.error('Installation failed:', error.message);
  }
}
```

## Conclusion

✅ **Automation is highly feasible** for OpenCode plugin installation, using the same approach as Claude and Gemini hooks. The process is actually simpler since it's just file copying rather than JSON manipulation.

### Recommended Next Steps
1. Add OpenCode plugin support to the NPX package design
2. Bundle the plugin file with the package
3. Implement the three commands (enable/disable/status)
4. Test alongside Claude and Gemini configurations
5. Update VS Code extension to use unified package

### Key Success Factors
- Simple file operations (copy/delete)
- No complex configuration merging
- Clear installation paths
- Consistent with existing agent patterns
- Can be part of unified NPX tool