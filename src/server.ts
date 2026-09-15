import { VERSION } from './utils/version.js';
import { registerAllTools, getToolDefinitions } from './tools/handlers.js';
import { registerAllPrompts } from './tools/prompts.js';
import { storage } from './core/storage.js';
import { logger } from './logger.js';
import { NativeMcpServer, NativeResourceTemplate } from './transport/native-mcp.js';

export function registerAllResources(server: any): void {
  // 1. memory-state
  server.registerResource(
    'memory-state',
    new NativeResourceTemplate('memory://states/{stateId}', {
      list: undefined,
    }),
    {
      title: 'Visual State Record',
      description: 'Read a cached visual state record by ID',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const stateId = variables?.stateId;
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

  // 2. memory-health
  server.registerResource(
    'memory-health',
    new NativeResourceTemplate('memory://health', { list: undefined }),
    {
      title: 'Memory Health',
      description: 'Check operational status of LanceDB, Sharp, CLIP, and server version',
      mimeType: 'application/json',
    },
    async (uri: URL) => {
      const { embeddings } = await import('./core/embeddings.js');
      const health = {
        status: 'healthy',
        version: VERSION,
        database: 'LanceDB (connected)',
        clip_model_ready: embeddings.isReady(),
        fallback_mode: embeddings.isFallback,
        uptime_seconds: Math.floor(process.uptime()),
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(health, null, 2),
          },
        ],
      };
    }
  );

  // 3. vision-health
  server.registerResource(
    'vision-health',
    new NativeResourceTemplate('vision:///health', { list: undefined }),
    {
      title: 'Vision Health',
      description: 'Check operational status of vision-memory-mcp server',
      mimeType: 'application/json',
    },
    async (uri: URL) => {
      const { embeddings } = await import('./core/embeddings.js');
      const health = {
        status: 'healthy',
        version: VERSION,
        database: 'LanceDB (connected)',
        clip_model_ready: embeddings.isReady(),
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(health, null, 2),
          },
        ],
      };
    }
  );

  // 4. memory-metrics
  server.registerResource(
    'memory-metrics',
    new NativeResourceTemplate('memory://metrics', { list: undefined }),
    {
      title: 'Memory Metrics',
      description: 'Query real-time cache hit ratios, token savings, and tier latency statistics',
      mimeType: 'application/json',
    },
    async (uri: URL) => {
      const { metricsCollector } = await import('./core/metrics.js');
      const stats = metricsCollector.getStats();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }
  );

  // 5. memory-specs
  server.registerResource(
    'memory-specs',
    new NativeResourceTemplate('memory://specs', { list: undefined }),
    {
      title: 'Memory Specs',
      description: 'List active visual SDD design specification baselines',
      mimeType: 'application/json',
    },
    async (uri: URL) => {
      const { listVisualSpecs } = await import('./core/visual-spec.js');
      const specs = await listVisualSpecs();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(specs, null, 2),
          },
        ],
      };
    }
  );

  // Register pv://docs/... documentation resources (E13)
  const toolDefs = getToolDefinitions();
  for (const tool of toolDefs) {
    server.registerResource(
      `docs-${tool.name}`,
      `pv://docs/${tool.name}`,
      {
        title: `${tool.name} Documentation`,
        description: `Complete parameter schema and documentation for ${tool.name}`,
        mimeType: 'application/json',
      },
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tool: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              },
              null,
              2
            ),
          },
        ],
      })
    );
  }

  server.registerResource(
    'tool-docs-template',
    new NativeResourceTemplate('pv://docs/{toolName}', { list: undefined }),
    {
      title: 'Tool Documentation Template',
      description: 'Fetch detailed tool documentation and parameter schema via pv://docs/{toolName}',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const toolName = Array.isArray(variables.toolName) ? variables.toolName[0] : variables.toolName;
      const tool = toolDefs.find((t) => t.name === toolName);
      if (!tool) {
        throw new Error(`Documentation not found for tool: "${toolName}"`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tool: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

// Zero-Dependency Native McpServer Factory
export function createNativeServer(): NativeMcpServer {
  const native = new NativeMcpServer({
    name: 'vision-memory-mcp',
    version: VERSION,
  });

  registerAllTools(native);
  registerAllResources(native);
  registerAllPrompts(native);

  return native;
}

export const server = createNativeServer();
