import { describe, it, expect } from 'vitest';
import {
  NativeMcpServer,
  NativeClient,
  NativeInMemoryTransport,
  NativeResourceTemplate,
  NativeStdioTransport,
  validateParams,
  zodToJsonSchema,
  ErrorCode,
} from '../../src/transport/native-mcp.js';

describe('Vision-Memory Native Transport & Client Exhaustive Coverage', () => {
  it('handles client-server initialize, tools, prompts, resources, and error forwarding', async () => {
    const server = new NativeMcpServer({ name: 'test-vision-server', version: '1.0.0' });

    // Register a tool returning object
    server.registerTool(
      'echo_tool',
      {
        title: 'Echo tool',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
      async (args: any) => ({
        content: [{ type: 'text', text: `Echo: ${args.text}` }],
      })
    );

    // Register a tool returning raw string
    server.registerTool(
      'string_tool',
      { title: 'String tool' },
      async () => 'raw string output'
    );

    // Register a tool throwing generic error
    server.registerTool(
      'throw_tool',
      { title: 'Throw tool' },
      async () => {
        throw new Error('boom');
      }
    );

    // Register a prompt
    server.registerPrompt(
      'system_prompt',
      {
        title: 'System prompt',
        argsSchema: {
          properties: {
            role: { description: 'Target user role' },
          },
          required: ['role'],
        },
      },
      async (args: any) => ({
        messages: [{ role: 'user', content: { type: 'text', text: `Role: ${args.role}` } }],
      })
    );

    // Register static resource
    server.registerResource(
      'config',
      'config://app',
      { title: 'config', mimeType: 'application/json' },
      async () => ({
        contents: [{ uri: 'config://app', mimeType: 'application/json', text: '{"debug":true}' }],
      })
    );

    // Register templated resource
    server.registerResource(
      'item_detail',
      new NativeResourceTemplate('items://{id}'),
      { title: 'Item Detail' },
      async (uri, vars) => ({
        contents: [{ uri: uri.toString(), text: `Item ID: ${vars.id}` }],
      })
    );

    const [clientTransport, serverTransport] = NativeInMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new NativeClient(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: { prompts: {}, resources: {} } }
    );
    await client.connect(clientTransport);

    // 1. tools
    const tools = await client.listTools();
    expect(tools.tools.some((t: any) => t.name === 'echo_tool')).toBe(true);

    const toolRes = await client.callTool({ name: 'echo_tool', arguments: { text: 'hello' } });
    expect(toolRes.content[0].text).toBe('Echo: hello');

    const strToolRes = await client.callTool({ name: 'string_tool' });
    expect(strToolRes.content[0].text).toBe('raw string output');

    const throwRes = await client.callTool({ name: 'throw_tool' });
    expect(throwRes.isError).toBe(true);

    const badTool = await client.callTool({ name: 'unknown_tool', arguments: {} });
    expect(badTool.isError).toBe(true);

    // 2. prompts
    const prompts = await client.listPrompts();
    expect(prompts.prompts.some((p: any) => p.name === 'system_prompt')).toBe(true);

    const promptRes = await client.getPrompt({ name: 'system_prompt', arguments: { role: 'tester' } });
    expect(promptRes.messages[0].content.text).toBe('Role: tester');
    expect(server._registeredPrompts['system_prompt']).toBeDefined();

    // 3. resources
    const resources = await client.listResources();
    expect(resources.resources.some((r: any) => r.name === 'config')).toBe(true);

    const resourceRes = await client.readResource({ uri: 'config://app' });
    expect(resourceRes.contents[0].text).toContain('"debug":true');

    // Templated resource read
    const tmplRes = await client.readResource({ uri: 'items://42' });
    expect(tmplRes.contents[0].text).toBe('Item ID: 42');

    // Templates list
    const tmplList = await client.request('resources/templates/list');
    expect(tmplList.resourceTemplates.length).toBeGreaterThan(0);

    // Ping
    const pingRes = await client.request('ping');
    expect(pingRes).toEqual({});

    // 4. Server internal getters
    expect(server._registeredTools['echo_tool']).toBeDefined();
    expect(server._registeredTools['echo_tool'].handler).toBeDefined();

    // 5. close
    await client.close();
    await server.close();
  });

  describe('validateParams edge cases', () => {
    it('validates schema types, required fields, and enums', () => {
      expect(() => validateParams('tool', undefined, {})).not.toThrow();
      expect(() => validateParams('tool', { required: ['missing'] }, {})).toThrow(
        'Missing required argument'
      );
      expect(() =>
        validateParams('tool', { properties: { s: { type: 'string' } } }, { s: 123 })
      ).toThrow('expected string');
      expect(() =>
        validateParams('tool', { properties: { n: { type: 'number' } } }, { n: 'x' })
      ).toThrow('expected number');
      expect(() =>
        validateParams('tool', { properties: { b: { type: 'boolean' } } }, { b: 'x' })
      ).toThrow('expected boolean');
      expect(() =>
        validateParams('tool', { properties: { a: { type: 'array' } } }, { a: 'x' })
      ).toThrow('expected array');
      expect(() =>
        validateParams('tool', { properties: { o: { type: 'object' } } }, { o: 'x' })
      ).toThrow('expected object');
      expect(() =>
        validateParams('tool', { properties: { o: { type: 'object' } } }, { o: ['arr'] })
      ).toThrow('expected object');
      expect(() =>
        validateParams(
          'tool',
          { properties: { e: { enum: ['alpha', 'beta'] } } },
          { e: 'gamma' }
        )
      ).toThrow('expected one of');
    });
  });

  describe('NativeStdioTransport stream operations', () => {
    it('handles line input parsing and invalid json errors', () => {
      const transport = new NativeStdioTransport();
      let lastMsg: any = null;
      transport.onMessage((msg) => {
        lastMsg = msg;
      });
      transport.start();

      const rl = (transport as any).rl;
      rl.emit('line', '   '); // empty line
      rl.emit('line', '{"jsonrpc":"2.0","method":"ping"}');
      expect(lastMsg?.method).toBe('ping');

      rl.emit('line', '{bad-json');
      transport.close();
    });
  });

  describe('zodToJsonSchema comprehensive def parser', () => {
    it('handles falsy schemas and plain JSON schemas without _def', () => {
      expect(zodToJsonSchema(null)).toEqual({ type: 'object' });
      expect(zodToJsonSchema(undefined)).toEqual({ type: 'object' });
      expect(zodToJsonSchema({})).toEqual({ type: 'object' });
      expect(zodToJsonSchema({ type: 'string', description: 'desc' })).toEqual({
        type: 'string',
        description: 'desc',
      });
      expect(zodToJsonSchema({ properties: { x: { type: 'number' } } })).toEqual({
        properties: { x: { type: 'number' } },
      });
    });

    it('parses simulated Zod _def types: primitives, enums, arrays, records', () => {
      // String
      const str = zodToJsonSchema({ _def: { typeName: 'ZodString', description: 'a string' } });
      expect(str).toEqual({ type: 'string', description: 'a string' });

      // Number
      const num = zodToJsonSchema({ _def: { typeName: 'ZodNumber' } });
      expect(num).toEqual({ type: 'number' });

      // Boolean
      const bool = zodToJsonSchema({ _def: { typeName: 'ZodBoolean' } });
      expect(bool).toEqual({ type: 'boolean' });

      // Enum
      const en = zodToJsonSchema({ _def: { typeName: 'ZodEnum', values: ['opt1', 'opt2'] } });
      expect(en).toEqual({ type: 'string', enum: ['opt1', 'opt2'] });

      // Array with items
      const arr = zodToJsonSchema({
        _def: { typeName: 'ZodArray', type: { _def: { typeName: 'ZodString' } } },
      });
      expect(arr).toEqual({ type: 'array', items: { type: 'string' } });

      // Record
      const rec = zodToJsonSchema({ _def: { typeName: 'ZodRecord' } });
      expect(rec).toEqual({ type: 'object' });

      // Modifiers
      const opt = zodToJsonSchema({
        _def: { typeName: 'ZodOptional', innerType: { _def: { typeName: 'ZodNumber' } } },
      });
      expect(opt).toEqual({ type: 'number' });

      const nullable = zodToJsonSchema({
        _def: { typeName: 'ZodNullable', innerType: { _def: { typeName: 'ZodBoolean' } } },
      });
      expect(nullable).toEqual({ type: 'boolean' });

      const def = zodToJsonSchema({
        _def: { typeName: 'ZodDefault', innerType: { _def: { typeName: 'ZodString' } } },
      });
      expect(def).toEqual({ type: 'string' });

      const eff = zodToJsonSchema({
        _def: { typeName: 'ZodEffects', schema: { _def: { typeName: 'ZodNumber' } } },
      });
      expect(eff).toEqual({ type: 'number' });
    });

    it('parses simulated ZodObject with required, optional, effects, and nullable fields', () => {
      const obj = zodToJsonSchema({
        _def: {
          typeName: 'ZodObject',
          shape: () => ({
            requiredField: {
              _def: { typeName: 'ZodString' },
              description: 'field description',
            },
            optionalField: {
              _def: {
                typeName: 'ZodOptional',
                innerType: { _def: { typeName: 'ZodNumber' } },
              },
            },
            defaultField: {
              _def: {
                typeName: 'ZodDefault',
                innerType: { _def: { typeName: 'ZodBoolean' } },
              },
            },
            effectsField: {
              _def: {
                typeName: 'ZodEffects',
                schema: {
                  _def: {
                    typeName: 'ZodOptional',
                    innerType: { _def: { typeName: 'ZodString' } },
                  },
                },
              },
            },
            nullableField: {
              _def: {
                typeName: 'ZodNullable',
                innerType: {
                  _def: {
                    typeName: 'ZodDefault',
                    innerType: { _def: { typeName: 'ZodNumber' } },
                  },
                },
              },
            },
          }),
        },
      });

      expect(obj.type).toBe('object');
      expect(obj.required).toContain('requiredField');
      expect(obj.required).not.toContain('optionalField');
      expect(obj.required).not.toContain('defaultField');
      expect(obj.required).not.toContain('effectsField');
      expect(obj.required).not.toContain('nullableField');
      expect(obj.properties.requiredField.description).toBe('field description');
    });
  });
});
