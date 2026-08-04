import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllPrompts } from '../../src/tools/prompts.js';

describe('MCP Prompts Module', () => {
  it('should register and execute all prompt callbacks with McpServer', () => {
    const server = new McpServer({ name: 'test-server', version: '0.7.21' });
    let analyzeCb: any;
    let diagnoseCb: any;
    let navigateCb: any;

    server.registerPrompt = ((name: string, config: any, cb: any) => {
      if (name === 'analyze-ui-state') analyzeCb = cb;
      if (name === 'diagnose-visual-regression') diagnoseCb = cb;
      if (name === 'navigate-to-goal') navigateCb = cb;
      return {} as any;
    }) as any;

    registerAllPrompts(server);

    expect(analyzeCb).toBeDefined();
    expect(diagnoseCb).toBeDefined();
    expect(navigateCb).toBeDefined();

    const res1 = analyzeCb({ state_id: 'state-1' });
    expect(res1.messages[0].content.text).toContain('state-1');

    const res2 = diagnoseCb({ baseline_snapshot: 'snap-1', current_snapshot: 'snap-2' });
    expect(res2.messages[0].content.text).toContain('snap-1');

    const res3 = navigateCb({ current_state_id: 'state-1', goal_description: 'reach checkout' });
    expect(res3.messages[0].content.text).toContain('reach checkout');
  });
});
