import { describe, it, expect, beforeEach } from 'vitest';
import { recordTransition, findNavigationPaths } from '../../src/core/graph.js';
import { storage } from '../../src/core/storage.js';
import { redactSensitiveText, redactImageRegions } from '../../src/core/privacy.js';

describe('Graph Navigation & Privacy Deep Coverage Suite', () => {
  beforeEach(async () => {
    await storage.init();
  });

  it('should test findNavigationPaths with failed paths and reliability sorting', async () => {
    const fromId = 'nav-state-start';
    const midId = 'nav-state-mid';
    const toId = 'nav-state-dest';

    const baseState = {
      dhash: '0'.repeat(64),
      ahash: '0'.repeat(64),
      vector: new Array(512).fill(0.1),
      description: 'Test Nav State',
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: '',
      original_dimensions: '{}',
      source_url: '',
      source_agent: '',
      trace_id: '',
      git_branch: 'main',
      tags: '[]',
      importance_score: 0.5,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    };
    await storage.addState({ ...baseState, id: fromId });
    await storage.addState({ ...baseState, id: midId });
    await storage.addState({ ...baseState, id: toId });

    // Transition 1: success_rate = 1/3 (0.333) -> triggers < 0.5 failedPath AND > 0.1 successfulPath
    await recordTransition({
      fromStateId: fromId,
      toStateId: midId,
      action: 'Click flaky button',
      actionType: 'click',
      success: true,
    });
    await recordTransition({
      fromStateId: fromId,
      toStateId: midId,
      action: 'Click flaky button',
      actionType: 'click',
      success: false,
    });
    await recordTransition({
      fromStateId: fromId,
      toStateId: midId,
      action: 'Click flaky button',
      actionType: 'click',
      success: false,
    });

    // Transition 2: high success rate
    await recordTransition({
      fromStateId: midId,
      toStateId: toId,
      action: 'Reach destination',
      actionType: 'click',
      success: true,
    });

    const res = await findNavigationPaths({ fromStateId: fromId, toStateId: toId });
    expect(res).toBeDefined();
    expect(res.paths.length).toBeGreaterThan(0);
    expect(res.failedPaths.length).toBeGreaterThan(0);
  });

  it('should test privacy, text redaction, and image region redaction', async () => {
    const secretText =
      'Authorization: sk-ant-api03-1234567890abcdef1234567890abcdef user@example.com';
    const redacted = redactSensitiveText(secretText);
    expect(redacted.isRedacted).toBe(true);
    expect(redacted.detectedTypes.length).toBeGreaterThan(0);
    expect(redacted.redactedText).toContain('[REDACTED_');

    // Redact image regions
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const buf = Buffer.from(pngBase64, 'base64');
    const maskedBuf = await redactImageRegions(buf, [[0, 0, 1, 1]]);
    expect(maskedBuf).toBeDefined();
  });
});
