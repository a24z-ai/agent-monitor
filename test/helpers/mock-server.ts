/**
 * Mock HTTP server for testing the agent monitor plugin
 * Provides a real HTTP server that simulates the VSCode extension endpoint
 */

import type { Server } from 'bun';

export interface MockServerOptions {
  port?: number;
  autoRespond?: boolean;
  defaultResponse?: MockResponse;
}

export interface MockResponse {
  block?: boolean;
  reason?: string;
  modifiedPrompt?: string;
  contextToInject?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface ReceivedEvent {
  hook_event_name: string;
  session_id?: string;
  tool_name?: string;
  prompt?: string;
  timestamp: number;
  body: any;
}

/**
 * Mock HTTP server for testing plugin interactions
 */
export class MockAgentMonitorServer {
  private server: Server | null = null;
  private receivedEvents: ReceivedEvent[] = [];
  private responseQueue: MockResponse[] = [];
  private defaultResponse: MockResponse;
  private autoRespond: boolean;
  private requestHandlers: Map<string, (body: any) => MockResponse | Promise<MockResponse>> =
    new Map();

  constructor(options: MockServerOptions = {}) {
    this.autoRespond = options.autoRespond ?? true;
    this.defaultResponse = options.defaultResponse ?? { block: false };
  }

  /**
   * Start the mock server
   */
  async start(port = 37123): Promise<void> {
    if (this.server) {
      throw new Error('Server already running');
    }

    // Try to start on specified port, fall back to port 0 (random) if busy
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < 3) {
      try {
        this.server = Bun.serve({
          port: attempts === 0 ? port : 0, // Use random port after first failure
          fetch: async (req) => {
            if (req.method !== 'POST') {
              return new Response('Method not allowed', { status: 405 });
            }

            const body = await req.json();
            const eventName = body.hook_event_name || 'unknown';

            // Record the event
            this.receivedEvents.push({
              hook_event_name: eventName,
              session_id: body.session_id,
              tool_name: body.tool_name,
              prompt: body.prompt,
              timestamp: Date.now(),
              body,
            });

            // Check for custom handler
            const handler = this.requestHandlers.get(eventName);
            if (handler) {
              const response = await handler(body);
              return new Response(JSON.stringify(response), {
                headers: { 'Content-Type': 'application/json' },
              });
            }

            // Use queued response or default
            let response: MockResponse;
            if (this.responseQueue.length > 0) {
              response = this.responseQueue.shift()!;
            } else if (this.autoRespond) {
              response = this.defaultResponse;
            } else {
              return new Response('No response configured', { status: 500 });
            }

            return new Response(JSON.stringify(response), {
              headers: { 'Content-Type': 'application/json' },
            });
          },
        });

        console.log(`[MockServer] Started on port ${this.server.port}`);
        return;
      } catch (error) {
        lastError = error as Error;
        attempts++;
        if (attempts < 3) {
          console.log(`[MockServer] Port ${port} busy, retrying with random port...`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    throw new Error(
      `Failed to start mock server after ${attempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Stop the mock server
   */
  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
      console.log('[MockServer] Stopped');
    }
  }

  /**
   * Queue a response for the next request
   */
  queueResponse(response: MockResponse): void {
    this.responseQueue.push(response);
  }

  /**
   * Queue multiple responses
   */
  queueResponses(responses: MockResponse[]): void {
    this.responseQueue.push(...responses);
  }

  /**
   * Set a custom handler for specific event types
   */
  onEvent(eventName: string, handler: (body: any) => MockResponse | Promise<MockResponse>): void {
    this.requestHandlers.set(eventName, handler);
  }

  /**
   * Get all received events
   */
  getEvents(): ReceivedEvent[] {
    return [...this.receivedEvents];
  }

  /**
   * Get events by type
   */
  getEventsByType(eventName: string): ReceivedEvent[] {
    return this.receivedEvents.filter((e) => e.hook_event_name === eventName);
  }

  /**
   * Get the last received event
   */
  getLastEvent(): ReceivedEvent | undefined {
    return this.receivedEvents[this.receivedEvents.length - 1];
  }

  /**
   * Get events for a specific session
   */
  getSessionEvents(sessionId: string): ReceivedEvent[] {
    return this.receivedEvents.filter((e) => e.session_id === sessionId);
  }

  /**
   * Clear all received events
   */
  clearEvents(): void {
    this.receivedEvents = [];
  }

  /**
   * Reset the server (clear events and response queue)
   */
  reset(): void {
    this.receivedEvents = [];
    this.responseQueue = [];
    this.requestHandlers.clear();
  }

  /**
   * Wait for a specific event to be received
   */
  async waitForEvent(eventName: string, timeout = 5000): Promise<ReceivedEvent | null> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const event = this.receivedEvents.find((e) => e.hook_event_name === eventName);
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  /**
   * Wait for multiple events
   */
  async waitForEvents(count: number, timeout = 5000): Promise<ReceivedEvent[]> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (this.receivedEvents.length >= count) {
        return this.receivedEvents.slice(0, count);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.receivedEvents;
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.server?.port ?? 0;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }
}

/**
 * Create a mock server with default settings
 */
export function createMockServer(options?: MockServerOptions): MockAgentMonitorServer {
  return new MockAgentMonitorServer(options);
}
