import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { storage } from './core/storage.js';
import { registerAllTools } from './tools/handlers.js';
import { logger } from './logger.js';

async function main() {
  logger.info('Starting vision-memory-mcp server...');

  try {
    // 1. Initialize Database Storage
    await storage.init();

    // 2. Instantiate MCP Server
    const server = new McpServer({
      name: 'vision-memory-mcp',
      version: '0.2.0',
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

    // 4. Register Tools
    logger.info('Registering tools...');
    registerAllTools(server);

    // 5. Connect Stdio Transport
    logger.info('Connecting Stdio transport stream...');
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('vision-memory-mcp server connected and running.');

    // 6. Handle Graceful Shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      try {
        await storage.optimize();
        logger.info('Database optimized and compacted.');
      } catch (err) {
        logger.error('Failed to optimize database during shutdown:', err);
      }
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

main();
