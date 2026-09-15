import { storage } from './core/storage.js';
import { embeddings } from './core/embeddings.js';
import { server, createNativeServer } from './server.js';
import { NativeStdioTransport } from './transport/native-mcp.js';
import { logger } from './logger.js';
import { runAutoInit } from './cli/init.js';
import { VERSION } from './utils/version.js';

let isShuttingDown = false;
let activeServer: { close(): Promise<void> } = server;

async function shutdown(reason: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Shutting down gracefully (${reason})...`);

  const forceExitTimer = setTimeout(() => {
    logger.warn('Shutdown timed out waiting for database optimization. Forcing exit...');
    process.exit(reason === 'uncaughtException' || reason === 'unhandledRejection' ? 1 : 0);
  }, 1000);
  forceExitTimer.unref();

  try {
    await activeServer.close();
    logger.info('MCP server connection closed.');
  } catch (err: any) {
    logger.error('Error closing MCP server:', err?.message || String(err));
  }

  try {
    await Promise.race([
      storage.optimize(),
      new Promise((resolve) => setTimeout(resolve, 800)),
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
}

async function main() {
  logger.info(`Starting vision-memory-mcp server v${VERSION}...`);

  try {
    // 0. Auto-scaffold workspace configurations and copilot instructions
    try {
      await runAutoInit();
    } catch (err: any) {
      logger.warn(`Auto-initialization skipped: ${err?.message || String(err)}`);
    }

    // 1. Initialize Database Storage & Pre-warm CLIP Embeddings
    await storage.init();
    embeddings.init().catch((err) => {
      logger.warn('CLIP pre-warming error:', err);
    });

    // 2. Native MCP Transport Wiring (Zero-Dependency)
    logger.info('Starting vision-memory-mcp with Native MCP Transport (Zero SDK)...');
    const native = createNativeServer();
    const nativeTransport = new NativeStdioTransport();
    await native.connect(nativeTransport);
    activeServer = native;

    logger.info('vision-memory-mcp server connected and running.');
  } catch (error) {
    logger.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

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

main();
