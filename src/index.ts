import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { storage } from './core/storage.js';
import { embeddings } from './core/embeddings.js';
import { registerAllTools } from './tools/handlers.js';
import { registerAllPrompts } from './tools/prompts.js';
import { logger } from './logger.js';

declare const __APP_VERSION__: string;
const SERVER_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.6.1';

async function main() {
  logger.info(`Starting vision-memory-mcp server v${SERVER_VERSION}...`);

  try {
    // 1. Initialize Database Storage & Pre-warm CLIP Embeddings
    await storage.init();
    embeddings.init().catch((err) => {
      logger.warn('CLIP pre-warming error:', err);
    });

    // 2. Instantiate MCP Server
    const server = new McpServer({
      name: 'vision-memory-mcp',
      version: SERVER_VERSION,
    });

    // 3. Register Resource Templates
    logger.info('Registering resource templates...');
    server.registerResource(
      'memory-state',
      new ResourceTemplate('memory://states/{stateId}', {
        list: undefined,
      }),
      {
        description: 'Read a cached visual state record by ID',
        mimeType: 'application/json',
      },
      async (uri: URL, variables: any) => {
        const stateId = variables.stateId;
        if (!stateId) {
          throw new Error('stateId parameter is required.');
        }
        logger.debug(`Reading memory state resource: ${stateId}`);
        const state = await storage.getState(stateId);

        if (!state) {
          throw new Error(`State with ID "${stateId}" not found.`);
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(state, null, 2),
            },
          ],
        };
      }
    );

    // 4. Register Tools & Prompts
    logger.info('Registering tools...');
    registerAllTools(server);
    logger.info('Registering prompts...');
    registerAllPrompts(server);

    // 5. Connect Stdio Transport
    logger.info('Connecting Stdio transport stream...');
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('vision-memory-mcp server connected and running.');

    // 6. Handle Graceful Shutdown
    let isShuttingDown = false;
    const shutdown = async (reason: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      logger.info(`Shutting down gracefully (${reason})...`);
      
      const forceExitTimer = setTimeout(() => {
        logger.warn('Shutdown timed out waiting for database optimization. Forcing exit...');
        process.exit(reason === 'uncaughtException' || reason === 'unhandledRejection' ? 1 : 0);
      }, 1000);
      forceExitTimer.unref();

      try {
        await Promise.race([
          storage.optimize(),
          new Promise((resolve) => setTimeout(resolve, 800))
        ]);
        logger.info('Database optimization check finished.');
      } catch (err) {
        logger.error('Failed to optimize database during shutdown:', err);
      }

      if (reason === 'uncaughtException' || reason === 'unhandledRejection') {
        process.exit(1);
      } else {
        process.exit(0);
      }
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err);
      void shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      void shutdown('unhandledRejection');
    });
    process.stdin.on('close', () => void shutdown('stdin close'));
    if (typeof (transport as any).onclose === 'function') {
      (transport as any).onclose = () => void shutdown('transport close');
    }
  } catch (error) {
    logger.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

main();
