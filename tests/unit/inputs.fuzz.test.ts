import { describe, it, expect } from 'vitest';
import { processImage, validateImageMagicBytes } from '../../src/core/image-pipeline.js';
import { resolveImageInput } from '../../src/tools/handlers.js';
import { config } from '../../src/config.js';

describe('Input Hardening & Fuzz Testing Suite', () => {
  it('should reject non-image magic byte buffers', () => {
    const corruptBuf = Buffer.from('THIS_IS_NOT_AN_IMAGE_FILE_BUFFER');
    expect(validateImageMagicBytes(corruptBuf)).toBe(false);
  });

  it('should throw error when processing invalid magic byte buffer in processImage', async () => {
    const corruptBuf = Buffer.from('INVALID_HEADER_DATA');
    await expect(processImage(corruptBuf)).rejects.toThrow(/magic bytes mismatch/i);
  });

  it('should reject path traversal or sensitive system paths in resolveImageInput', async () => {
    await expect(resolveImageInput(undefined, '/etc/passwd')).rejects.toThrow(
      /Access to sensitive file or path is restricted/i
    );
    await expect(resolveImageInput(undefined, '/home/user/.ssh/id_rsa')).rejects.toThrow(
      /Access to sensitive file or path is restricted/i
    );
    await expect(resolveImageInput(undefined, 'project/.env')).rejects.toThrow(
      /Access to sensitive file or path is restricted/i
    );
  });

  it('should reject unsupported file extensions in resolveImageInput', async () => {
    await expect(resolveImageInput(undefined, 'script.sh')).rejects.toThrow(
      /Unsupported file extension/i
    );
    await expect(resolveImageInput(undefined, 'payload.exe')).rejects.toThrow(
      /Unsupported file extension/i
    );
  });

  it('should enforce STRICT_MODE project root boundary checks', async () => {
    const origStrict = config.STRICT_MODE;
    (config as any).STRICT_MODE = true;

    try {
      await expect(resolveImageInput(undefined, '/tmp/outside-image.png')).rejects.toThrow(
        /STRICT_MODE enabled/i
      );
    } finally {
      (config as any).STRICT_MODE = origStrict;
    }
  });

  it('should safely handle empty or space-only input parameters', async () => {
    await expect(resolveImageInput('', '')).rejects.toThrow(
      /Either screenshot base64 or file_path must be provided/i
    );
  });
});
