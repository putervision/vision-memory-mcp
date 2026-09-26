import { describe, it, expect } from 'vitest';
import { processImage, validateImageMagicBytes } from '../../src/core/image-pipeline.js';
import { embeddings } from '../../src/core/embeddings.js';
import { restoreSnapshot } from '../../src/core/snapshots.js';
import {
  NativeStdioTransport,
  NativeMcpServer,
  NativeResourceTemplate,
  ErrorCode,
} from '../../src/transport/native-mcp.js';

describe('Vision-Memory Pipeline, Embeddings, Snapshots & Native MCP Boost', () => {
  describe('image-pipeline dimensions and scaling', () => {
    it('validates image magic bytes correctly', () => {
      // Valid PNG magic bytes
      const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(validateImageMagicBytes(pngBuf)).toBe(true);

      // Valid JPEG magic bytes
      const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(validateImageMagicBytes(jpgBuf)).toBe(true);

      // Valid GIF magic bytes
      const gifBuf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(validateImageMagicBytes(gifBuf)).toBe(true);

      // Valid WebP magic bytes
      const webpBuf = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(validateImageMagicBytes(webpBuf)).toBe(true);

      // Invalid bytes
      const invalidBuf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(validateImageMagicBytes(invalidBuf)).toBe(false);
    });

    it('processes fallback dimensions when sharp cannot parse buffer', async () => {
      // 1x1 valid PNG
      const base64Png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const buf = Buffer.from(base64Png, 'base64');
      const res = await processImage(buf);
      expect(res.width).toBe(1);
      expect(res.height).toBe(1);
      expect(res.thumbnail).toBeDefined();
    });

    it('rejects invalid video file signature in extractKeyframes', async () => {
      const { extractKeyframes } = await import('../../src/core/video-pipeline.js');
      await expect(extractKeyframes(Buffer.from('not-a-video-file'))).rejects.toThrow(
        'Unsupported or invalid video file signature'
      );
    });
  });

  describe('embeddings fallback and error handling', () => {
    it('returns zero vector in fallback mode', async () => {
      const origFallback = (embeddings as any).fallbackMode;
      try {
        (embeddings as any).fallbackMode = true;
        const imgVec = await embeddings.generateImageEmbedding(Buffer.from('fake'));
        expect(imgVec).toHaveLength(512);
        expect(imgVec[0]).toBe(0.0);

        const txtVec = await embeddings.generateTextEmbedding('hello');
        expect(txtVec).toHaveLength(512);
        expect(txtVec[0]).toBe(0.0);
      } finally {
        (embeddings as any).fallbackMode = origFallback;
      }
    });

    it('catches text embedding generation errors gracefully', async () => {
      await embeddings.init();
      const origModel = (embeddings as any).textModel;
      const origFallback = (embeddings as any).fallbackMode;
      try {
        (embeddings as any).fallbackMode = false;
        (embeddings as any).textModel = () => {
          throw new Error('Simulation model failure');
        };
        const vec = await embeddings.generateTextEmbedding('fail test');
        expect(vec).toHaveLength(512);
        expect(vec[0]).toBe(0.0);
      } finally {
        (embeddings as any).textModel = origModel;
        (embeddings as any).fallbackMode = origFallback;
      }
    });
  });

  describe('snapshots archive validation', () => {
    it('throws error when snapshot archive structure is invalid', async () => {
      await expect(restoreSnapshot(null as any)).rejects.toThrow(
        'Invalid snapshot archive structure.'
      );
      await expect(restoreSnapshot({} as any)).rejects.toThrow(
        'Invalid snapshot archive structure.'
      );
      await expect(
        restoreSnapshot({ snapshot: { name: 'snap' }, states: 'not-array' } as any)
      ).rejects.toThrow('Invalid snapshot archive structure.');
    });
  });

  describe('NativeStdioTransport & NativeMcpServer coverage', () => {
    it('instantiates and operates NativeStdioTransport', () => {
      const transport = new NativeStdioTransport();
      let receivedMsg: any = null;
      transport.onMessage((msg) => {
        receivedMsg = msg;
      });

      expect(typeof transport.start).toBe('function');
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.close).toBe('function');
      transport.close();
    });

    it('registers resources with various template signatures', () => {
      const server = new NativeMcpServer({ name: 'test-variants', version: '1.0.0' });

      // NativeResourceTemplate instance
      const tmpl = new NativeResourceTemplate('vision://item/{id}');
      server.registerResource('item-tmpl', tmpl, { title: 'Item Template' }, async () => ({
        contents: [],
      }));

      // Object with uriTemplate string
      server.registerResource(
        'obj-tmpl',
        { uriTemplate: 'vision://object/{objId}' },
        { title: 'Obj' },
        async () => ({ contents: [] })
      );

      // Object with template string
      server.registerResource(
        'direct-tmpl',
        { template: 'vision://direct/{dId}' },
        { title: 'Direct' },
        async () => ({ contents: [] })
      );

      // Object with uriTemplate.template
      server.registerResource(
        'nested-tmpl',
        { uriTemplate: { template: 'vision://nested/{nId}' } },
        { title: 'Nested' },
        async () => ({ contents: [] })
      );

      // Non-string / fallback
      server.registerResource('fallback-res', null as any, { title: 'Fallback' }, async () => ({
        contents: [],
      }));
    });

    it('handles message validation and error branches in NativeMcpServer', async () => {
      const server = new NativeMcpServer({ name: 'test-err-server', version: '1.0.0' });

      // Invalid JSON-RPC message without id returns null
      const resNull = await server.handleMessage(null as any);
      expect(resNull).toBeNull();

      // Missing version with id returns InvalidRequest error response
      const resBadVer = await server.handleMessage({
        jsonrpc: '1.0' as any,
        id: 1,
        method: 'ping',
      });
      expect(resBadVer?.error?.code).toBe(ErrorCode.InvalidRequest);

      // Unknown method
      const resUnknown = await server.handleMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'nonexistent/method',
      });
      expect(resUnknown?.error?.code).toBe(ErrorCode.MethodNotFound);

      // Notification (no id)
      const resNotification = await server.handleMessage({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 10 },
      } as any);
      expect(resNotification).toBeNull();
    });

    it('registers tool with raw zod schema to trigger conversion', () => {
      const server = new NativeMcpServer({ name: 'test-zod', version: '1.0.0' });
      server.registerTool(
        'tool-with-zod',
        {
          title: 'Tool With Zod',
          description: 'A tool defined with Zod-like schema',
          inputSchema: {
            _def: { typeName: 'ZodUnknown' },
          } as any,
        },
        async () => ({ ok: true })
      );
      expect((server as any).tools.has('tool-with-zod')).toBe(true);
    });
  });

  describe('Additional coverage boosts', () => {
    it('exercises prompts registration using legacy server.prompt method', async () => {
      const { registerAllPrompts } = await import('../../src/tools/prompts.js');
      const registered: Record<string, any> = {};
      const fakeServer = {
        prompt: (name: string, description: string, argsSchema: any, handler: any) => {
          registered[name] = { description, argsSchema, handler };
        },
      };

      registerAllPrompts(fakeServer);
      expect(registered['analyze-ui-state']).toBeDefined();
      expect(registered['diagnose-visual-regression']).toBeDefined();
      expect(registered['navigate-to-goal']).toBeDefined();
    });

    it('exercises embeddings SKIP_MODEL_LOAD branch', async () => {
      const { config } = await import('../../src/config.js');
      const origSkip = config.SKIP_MODEL_LOAD;
      try {
        config.SKIP_MODEL_LOAD = true;
        (embeddings as any).initialized = false;
        (embeddings as any).fallbackMode = false;
        await embeddings.init();
        expect(embeddings.isFallback).toBe(true);
      } finally {
        config.SKIP_MODEL_LOAD = origSkip;
      }
    });

    it('exercises fs utils getDirSize error branches', async () => {
      const { getDirSize } = await import('../../src/utils/fs.js');
      expect(getDirSize('/non/existent/path/for/sure')).toBe(0);
    });

    it('exercises schemas toJsonSchema fallback branches and safeParse non-Error', async () => {
      const { Schema, ArraySchema, RecordSchema, ObjectSchema } =
        await import('../../src/schema/schemas.js');

      class StringThrowingSchema extends Schema<any> {
        toJsonSchema(): Record<string, any> {
          return {};
        }
        parse(): any {
          throw 'simple string error';
        }
      }

      const res = new StringThrowingSchema().safeParse('val');
      expect(res.success).toBe(false);
      expect((res as any).error.message).toBe('Validation error');

      const arrSchema = new ArraySchema({} as any);
      expect(arrSchema.toJsonSchema().items).toEqual({});

      const recSchema = new RecordSchema({} as any);
      expect(recSchema.toJsonSchema().additionalProperties).toBe(true);

      const objSchema = new ObjectSchema({ item: {} as any });
      expect(objSchema.toJsonSchema().properties.item).toEqual({});
    });
  });
});
