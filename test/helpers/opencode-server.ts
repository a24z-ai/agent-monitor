/**
 * OpenCode Server Manager for Integration Tests
 * Manages the lifecycle of an OpenCode server instance for testing
 */

import { type Subprocess, spawn } from 'bun';

export interface OpenCodeServerOptions {
  port?: number;
  timeout?: number;
  printLogs?: boolean;
}

export class OpenCodeServerManager {
  private process: Subprocess | null = null;
  private port: number;
  private printLogs: boolean;
  private startupTimeout: number;

  constructor(options: OpenCodeServerOptions = {}) {
    this.port = options.port ?? 3456;
    this.printLogs = options.printLogs ?? false;
    this.startupTimeout = options.timeout ?? 10000;
  }

  /**
   * Start the OpenCode server
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Server already running');
    }

    console.log(`[OpenCode Server] Starting on port ${this.port}...`);

    // Spawn the opencode serve process
    this.process = spawn(['opencode', 'serve', '--port', String(this.port)], {
      stdout: this.printLogs ? 'inherit' : 'pipe',
      stderr: this.printLogs ? 'inherit' : 'pipe',
      env: {
        ...process.env,
      },
    });

    // Wait for server to be ready
    const startTime = Date.now();
    while (Date.now() - startTime < this.startupTimeout) {
      try {
        const response = await fetch(`http://localhost:${this.port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          console.log(`[OpenCode Server] Started successfully on port ${this.port}`);
          return;
        }
      } catch (_error) {
        // Server not ready yet, continue waiting
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // If we get here, server didn't start in time
    this.stop();
    throw new Error(
      `OpenCode server failed to start within ${this.startupTimeout}ms. ` +
        'Make sure opencode is installed and available in PATH.'
    );
  }

  /**
   * Stop the OpenCode server
   */
  stop(): void {
    if (this.process) {
      console.log('[OpenCode Server] Stopping...');
      this.process.kill();
      this.process = null;
      console.log('[OpenCode Server] Stopped');
    }
  }

  /**
   * Get the server URL
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.process !== null;
  }

  /**
   * Wait for the server to be ready (useful after starting)
   */
  async waitForReady(timeout = 5000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${this.port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          return true;
        }
      } catch (_error) {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }
}

/**
 * Global server instance for shared test setup
 */
let globalServer: OpenCodeServerManager | null = null;

/**
 * Get or create a global OpenCode server instance
 * This allows tests to share a single server instance
 */
export function getGlobalServer(options?: OpenCodeServerOptions): OpenCodeServerManager {
  if (!globalServer) {
    globalServer = new OpenCodeServerManager(options);
  }
  return globalServer;
}

/**
 * Setup global OpenCode server for all tests
 * Call this in a global beforeAll hook
 */
export async function setupGlobalServer(
  options?: OpenCodeServerOptions
): Promise<OpenCodeServerManager> {
  const server = getGlobalServer(options);
  if (!server.isRunning()) {
    await server.start();
  }
  return server;
}

/**
 * Teardown global OpenCode server
 * Call this in a global afterAll hook
 */
export function teardownGlobalServer(): void {
  if (globalServer) {
    globalServer.stop();
    globalServer = null;
  }
}
