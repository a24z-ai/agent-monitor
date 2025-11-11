/**
 * Global test setup
 * This file is run once before all tests
 */

import { afterAll, beforeAll } from 'bun:test';
import { setupGlobalServer, teardownGlobalServer } from './helpers/opencode-server';

/**
 * Check if we should run integration tests that require OpenCode server
 */
export const shouldRunIntegrationTests = (): boolean => {
  // Skip integration tests if SKIP_INTEGRATION is set
  if (process.env.SKIP_INTEGRATION === 'true') {
    return false;
  }

  // Skip if we're in CI and OpenCode is not available
  if (process.env.CI && !process.env.OPENCODE_SERVER_URL) {
    return false;
  }

  return true;
};

/**
 * Setup global OpenCode server for integration tests
 * Only starts if integration tests should run
 */
beforeAll(async () => {
  if (!shouldRunIntegrationTests()) {
    console.log('[Test Setup] Skipping OpenCode server setup (integration tests disabled)');
    return;
  }

  // Check if external server URL is provided
  if (process.env.OPENCODE_SERVER_URL) {
    console.log(`[Test Setup] Using external OpenCode server: ${process.env.OPENCODE_SERVER_URL}`);
    return;
  }

  // Start our own OpenCode server
  try {
    console.log('[Test Setup] Starting OpenCode server for integration tests...');
    await setupGlobalServer({
      port: 3456,
      printLogs: process.env.DEBUG === 'true',
      timeout: 15000,
    });
    console.log('[Test Setup] OpenCode server ready');
  } catch (error) {
    console.error('[Test Setup] Failed to start OpenCode server:', error);
    console.log('[Test Setup] Integration tests will be skipped. To run them, either:');
    console.log('  1. Ensure opencode is installed and in PATH');
    console.log('  2. Start opencode server manually and set OPENCODE_SERVER_URL');
    console.log('  3. Set SKIP_INTEGRATION=true to explicitly skip');
    process.env.SKIP_INTEGRATION = 'true';
  }
}, 20000); // 20 second timeout for server startup

/**
 * Cleanup global resources
 */
afterAll(() => {
  console.log('[Test Teardown] Cleaning up...');
  teardownGlobalServer();
});
