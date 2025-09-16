/**
 * Comprehensive Claude Tool Registry
 * Based on Claude Code documentation and observed tools
 */

/**
 * Tool categories for organization
 */
export const TOOL_CATEGORIES = {
  SUBAGENT: 'Subagent',
  FILE_OPS: 'File Operations',
  SEARCH: 'Search Operations',
  WEB: 'Web Operations',
  NOTEBOOK: 'Notebook Operations',
  SHELL: 'Shell Operations',
  TODO: 'Task Management',
  PLANNING: 'Planning',
} as const;

/**
 * Complete list of Claude tools with categorization
 */
export const CLAUDE_TOOLS = {
  // Subagent
  TASK: 'Task',

  // File operations
  READ: 'Read',
  WRITE: 'Write',
  EDIT: 'Edit',
  MULTI_EDIT: 'MultiEdit',

  // Search operations
  GLOB: 'Glob',
  GREP: 'Grep',
  LS: 'LS',

  // Shell operations
  BASH: 'Bash',
  BASH_OUTPUT: 'BashOutput',
  KILL_SHELL: 'KillShell',

  // Web operations
  WEB_FETCH: 'WebFetch',
  WEB_SEARCH: 'WebSearch',

  // Notebook operations
  NOTEBOOK_READ: 'NotebookRead',
  NOTEBOOK_EDIT: 'NotebookEdit',

  // Task management
  TODO_WRITE: 'TodoWrite',

  // Planning
  EXIT_PLAN_MODE: 'ExitPlanMode',
} as const;

export type ClaudeToolName = (typeof CLAUDE_TOOLS)[keyof typeof CLAUDE_TOOLS];

/**
 * Tool metadata including category and description
 */
export interface ToolMetadata {
  name: ClaudeToolName;
  category: (typeof TOOL_CATEGORIES)[keyof typeof TOOL_CATEGORIES];
  description: string;
  sensitive?: boolean; // If tool may handle sensitive data
}

/**
 * Tool registry with metadata
 */
export const TOOL_REGISTRY: Record<ClaudeToolName, ToolMetadata> = {
  // Subagent
  [CLAUDE_TOOLS.TASK]: {
    name: CLAUDE_TOOLS.TASK,
    category: TOOL_CATEGORIES.SUBAGENT,
    description: 'Launch a new agent to handle complex tasks',
  },

  // File operations
  [CLAUDE_TOOLS.READ]: {
    name: CLAUDE_TOOLS.READ,
    category: TOOL_CATEGORIES.FILE_OPS,
    description: 'Read file contents',
    sensitive: true,
  },
  [CLAUDE_TOOLS.WRITE]: {
    name: CLAUDE_TOOLS.WRITE,
    category: TOOL_CATEGORIES.FILE_OPS,
    description: 'Write content to a file',
    sensitive: true,
  },
  [CLAUDE_TOOLS.EDIT]: {
    name: CLAUDE_TOOLS.EDIT,
    category: TOOL_CATEGORIES.FILE_OPS,
    description: 'Edit file content',
    sensitive: true,
  },
  [CLAUDE_TOOLS.MULTI_EDIT]: {
    name: CLAUDE_TOOLS.MULTI_EDIT,
    category: TOOL_CATEGORIES.FILE_OPS,
    description: 'Make multiple edits to a file',
    sensitive: true,
  },

  // Search operations
  [CLAUDE_TOOLS.GLOB]: {
    name: CLAUDE_TOOLS.GLOB,
    category: TOOL_CATEGORIES.SEARCH,
    description: 'Find files by pattern',
  },
  [CLAUDE_TOOLS.GREP]: {
    name: CLAUDE_TOOLS.GREP,
    category: TOOL_CATEGORIES.SEARCH,
    description: 'Search file contents',
  },
  [CLAUDE_TOOLS.LS]: {
    name: CLAUDE_TOOLS.LS,
    category: TOOL_CATEGORIES.SEARCH,
    description: 'List directory contents',
  },

  // Shell operations
  [CLAUDE_TOOLS.BASH]: {
    name: CLAUDE_TOOLS.BASH,
    category: TOOL_CATEGORIES.SHELL,
    description: 'Execute bash commands',
    sensitive: true,
  },
  [CLAUDE_TOOLS.BASH_OUTPUT]: {
    name: CLAUDE_TOOLS.BASH_OUTPUT,
    category: TOOL_CATEGORIES.SHELL,
    description: 'Read output from background shell',
  },
  [CLAUDE_TOOLS.KILL_SHELL]: {
    name: CLAUDE_TOOLS.KILL_SHELL,
    category: TOOL_CATEGORIES.SHELL,
    description: 'Kill a background shell',
  },

  // Web operations
  [CLAUDE_TOOLS.WEB_FETCH]: {
    name: CLAUDE_TOOLS.WEB_FETCH,
    category: TOOL_CATEGORIES.WEB,
    description: 'Fetch and process web content',
  },
  [CLAUDE_TOOLS.WEB_SEARCH]: {
    name: CLAUDE_TOOLS.WEB_SEARCH,
    category: TOOL_CATEGORIES.WEB,
    description: 'Search the web',
  },

  // Notebook operations
  [CLAUDE_TOOLS.NOTEBOOK_READ]: {
    name: CLAUDE_TOOLS.NOTEBOOK_READ,
    category: TOOL_CATEGORIES.NOTEBOOK,
    description: 'Read Jupyter notebook',
    sensitive: true,
  },
  [CLAUDE_TOOLS.NOTEBOOK_EDIT]: {
    name: CLAUDE_TOOLS.NOTEBOOK_EDIT,
    category: TOOL_CATEGORIES.NOTEBOOK,
    description: 'Edit Jupyter notebook',
    sensitive: true,
  },

  // Task management
  [CLAUDE_TOOLS.TODO_WRITE]: {
    name: CLAUDE_TOOLS.TODO_WRITE,
    category: TOOL_CATEGORIES.TODO,
    description: 'Manage task list',
  },

  // Planning
  [CLAUDE_TOOLS.EXIT_PLAN_MODE]: {
    name: CLAUDE_TOOLS.EXIT_PLAN_MODE,
    category: TOOL_CATEGORIES.PLANNING,
    description: 'Exit planning mode',
  },
};

/**
 * Check if a tool name is a known Claude tool
 */
export function isClaudeTool(toolName: string): toolName is ClaudeToolName {
  return Object.values(CLAUDE_TOOLS).includes(toolName as ClaudeToolName);
}

/**
 * Get tool metadata by name
 */
export function getToolMetadata(toolName: string): ToolMetadata | undefined {
  if (!isClaudeTool(toolName)) {
    return undefined;
  }
  return TOOL_REGISTRY[toolName];
}

/**
 * Get tools by category
 */
export function getToolsByCategory(
  category: (typeof TOOL_CATEGORIES)[keyof typeof TOOL_CATEGORIES]
): ToolMetadata[] {
  return Object.values(TOOL_REGISTRY).filter((tool) => tool.category === category);
}

/**
 * Check if tool handles sensitive data
 */
export function isToolSensitive(toolName: string): boolean {
  const metadata = getToolMetadata(toolName);
  return metadata?.sensitive ?? false;
}
