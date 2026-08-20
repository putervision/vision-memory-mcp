import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getRegistry,
  registerProject,
  unregisterProject,
  getProjectFromRegistry,
  getRegistryPath,
} from '../../src/core/registry.js';
import { redactSensitiveText, redactImageRegions } from '../../src/core/privacy.js';
import { getWorkspaceMemoryPaths } from '../../src/config.js';

describe('Vision Memory Registry & Privacy & Config Deep Branch Matrix', () => {
  let tmpHome: string;
  let origEnvReg: string | undefined;

  beforeEach(() => {
    origEnvReg = process.env.VISION_MEMORY_REGISTRY_PATH;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-reg-deep-'));
    process.env.VISION_MEMORY_REGISTRY_PATH = path.join(tmpHome, 'projects.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (origEnvReg !== undefined) {
      process.env.VISION_MEMORY_REGISTRY_PATH = origEnvReg;
    } else {
      delete process.env.VISION_MEMORY_REGISTRY_PATH;
    }
    if (fs.existsSync(tmpHome)) {
      try {
        fs.rmSync(tmpHome, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should test registry cache hit, corrupt json, homedir guard, and rename fallback', () => {
    // 1. Homedir guard
    registerProject('homedir_proj', os.homedir());
    expect(getProjectFromRegistry('homedir_proj')).toBeUndefined();

    // 2. Normal register & get (cache hit)
    const testDir = path.join(tmpHome, 'my_proj');
    fs.mkdirSync(testDir, { recursive: true });
    registerProject('test_proj', testDir);

    const retrieved1 = getProjectFromRegistry('test_proj');
    expect(retrieved1).toBe(path.resolve(testDir));

    // Cache hit branch
    const retrieved2 = getRegistry();
    expect(retrieved2['test_proj']).toBe(path.resolve(testDir));

    // 3. Unregister
    unregisterProject('test_proj');
    expect(getProjectFromRegistry('test_proj')).toBeUndefined();

    // 4. Test corrupt registry handling
    const regPath = getRegistryPath();
    const regDir = path.dirname(regPath);
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(regPath, '{ corrupt json !!!');
    // Force cache invalidation by mocking Date.now
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10000);
    const fallbackReg = getRegistry();
    expect(fallbackReg).toBeDefined();
    nowSpy.mockRestore();

    // 5. Test rename failure fallback in register and unregister
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('Mock EXDEV cross-device link');
    });

    registerProject('proj_rename_fallback', testDir);
    expect(getProjectFromRegistry('proj_rename_fallback')).toBe(path.resolve(testDir));

    unregisterProject('proj_rename_fallback');
    expect(getProjectFromRegistry('proj_rename_fallback')).toBeUndefined();

    renameSpy.mockRestore();
  });

  it('should test privacy redactSensitiveText and redactImageRegions edge cases', async () => {
    // redactSensitiveText with various inputs
    expect(redactSensitiveText('').redactedText).toBe('');
    expect(redactSensitiveText(`Bearer ghp_${'a'.repeat(36)}`).redactedText).toContain(
      '[REDACTED_GITHUB_TOKEN]'
    );
    expect(redactSensitiveText('User email: test.user@example.com').redactedText).toContain(
      '[REDACTED_EMAIL]'
    );

    // redactImageRegions with empty boxes
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const buf = Buffer.from(pngBase64, 'base64');
    const maskedEmpty = await redactImageRegions(buf, []);
    expect(maskedEmpty).toBe(buf);

    // redactImageRegions with single box
    const maskedBox = await redactImageRegions(buf, [[0, 0, 1, 1]]);
    expect(maskedBox).toBeDefined();
  });

  it('should test getWorkspaceMemoryPaths', () => {
    const paths = getWorkspaceMemoryPaths(process.cwd());
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });
});
