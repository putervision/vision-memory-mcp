import { describe, it, expect, vi, beforeAll } from 'vitest';
import { storage } from '../../src/core/storage.js';
import { runVideoListCommand } from '../../src/cli/video-commands.js';

describe('video-cli unit tests', () => {
  beforeAll(async () => {
    await storage.init();
  });

  it('should run video list command without throwing error', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runVideoListCommand();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
