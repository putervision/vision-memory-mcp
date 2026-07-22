import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCurrentBranch } from '../../core/cache.js';
import { retrieveState } from '../../core/retrieval.js';
import { storage } from '../../core/storage.js';
import { processImage } from '../../core/image-pipeline.js';
import { calculateDHash, calculateAHash } from '../../core/hash.js';
import { analyzeScreenshotWithLLM } from '../../vision/analyzer.js';
import { embeddings } from '../../core/embeddings.js';
import { memoryCache } from '../../core/cache.js';
import { VisualState } from '../../types.js';
import { logger } from '../../logger.js';
import crypto from 'crypto';

export function registerAnalyzeScreenshotTool(server: McpServer): void {
  server.registerTool(
    'analyze_screenshot',
    {
      description:
        'Ingest a base64 screenshot, check visual state cache, and return details of the state (generating a new memory entry if not matched).',
      inputSchema: z.object({
        screenshot: z
          .string()
          .min(1, 'Screenshot parameter must not be empty')
          .refine(
            (val) => {
              const cleaned = val
                .replace(/^data:image\/[a-zA-Z]+;base64,/, '')
                .trim();
              return cleaned.length > 0 && /^[A-Za-z0-9+/=]+$/.test(cleaned);
            },
            { message: 'Invalid base64-encoded image payload' }
          )
          .describe('Base64-encoded image string (required)'),
        description: z
          .string()
          .optional()
          .describe('Optional human/agent-provided description of the screen'),
        accessibility_tree: z
          .string()
          .optional()
          .describe('Optional JSON string representing the simplified AX tree'),
        source_url: z
          .string()
          .optional()
          .describe('Optional app/page path or URL where captured'),
        tags: z
          .array(z.string())
          .optional()
          .describe('Optional classification tags'),
        force_refresh: z
          .boolean()
          .optional()
          .describe('Bypass L1/L2 cache and force new ingestion'),
        git_branch: z
          .string()
          .optional()
          .describe('Override the active git branch'),
        trace_id: z
          .string()
          .optional()
          .describe(
            'Optional session_id or trace_id for correlation with state-memory-mcp'
          ),
      }),
    },
    async (params) => {
      try {
        const branch = params.git_branch ?? getCurrentBranch();

        const retrieval = await retrieveState({
          screenshot: params.screenshot,
          strategy: 'thorough',
          forceRefresh: params.force_refresh,
          gitBranch: branch,
          accessibilityTree: params.accessibility_tree,
        });

        if (retrieval.is_known && retrieval.state_id) {
          if (
            params.description &&
            params.description !== retrieval.description
          ) {
            await storage.updateState(retrieval.state_id, {
              description: params.description,
            });
            retrieval.description = params.description;
          }
          return {
            content: [
              { type: 'text', text: JSON.stringify(retrieval, null, 2) },
            ],
          };
        }

        logger.info('Cache miss: generating new state entry...');
        const processed = await processImage(params.screenshot);
        const dhash = await calculateDHash(processed.normalizedBuffer);
        const ahash = await calculateAHash(processed.normalizedBuffer);

        let finalDesc = params.description ?? '';
        if (!finalDesc) {
          try {
            finalDesc = await analyzeScreenshotWithLLM(params.screenshot);
          } catch {
            finalDesc = 'Unanalyzed Visual State';
          }
        }

        const vector = await embeddings.generateImageEmbedding(
          processed.normalizedBuffer
        );
        const newId = crypto.randomUUID();
        const newState: VisualState = {
          id: newId,
          dhash,
          ahash,
          vector,
          description: finalDesc,
          structured_data: '{}',
          accessibility_tree: params.accessibility_tree ?? '{}',
          thumbnail: processed.thumbnail,
          original_dimensions: JSON.stringify({
            width: processed.originalWidth,
            height: processed.originalHeight,
          }),
          source_url: params.source_url ?? '',
          source_agent: 'agent',
          trace_id: params.trace_id ?? '',
          git_branch: branch,
          tags: JSON.stringify(params.tags ?? []),
          importance_score: 0.5,
          created_at: Date.now(),
          last_accessed: Date.now(),
          access_count: 1,
          ttl: 0,
        };

        await storage.addState(newState);
        memoryCache.set(newState);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  state_id: newId,
                  is_known: false,
                  match_type: 'new',
                  similarity_score: 0.0,
                  description: finalDesc,
                  thumbnail: processed.thumbnail,
                  dimensions: {
                    width: processed.originalWidth,
                    height: processed.originalHeight,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        logger.error('Error in analyze_screenshot tool:', error);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to analyze screenshot: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
