import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllTools } from '../../src/tools/handlers.js';
import { VERSION } from '../../src/utils/version.js';

describe('app_version tool in vision-memory-mcp', () => {
  let toolMap: Map<string, Function>;

  const mockServer = {
    registerTool: (name: string, config: any, handler: Function) => {
      toolMap.set(name, handler);
    },
  };

  beforeEach(() => {
    toolMap = new Map();
    registerAllTools(mockServer as any);
  });

  it('should register app_version tool', () => {
    expect(toolMap.has('app_version')).toBe(true);
  });

  it('should return correct vision-memory-mcp version payload', async () => {
    const handler = toolMap.get('app_version')!;
    const res = await handler({});
    expect(res).toBeDefined();
    expect(res.content).toBeDefined();
    expect(res.content.length).toBe(1);

    const payload = JSON.parse(res.content[0].text);
    expect(payload.name).toBe('@putervision/vision-memory-mcp');
    expect(payload.mcp_name).toBe('io.github.putervision/vision-memory-mcp');
    expect(payload.version).toBe(VERSION);
    expect(payload.description).toContain('Persistent visual cache');
    expect(payload.environment).toBeDefined();
    expect(payload.environment.node_version).toBe(process.version);
  });
});
