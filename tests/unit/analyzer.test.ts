import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeScreenshotWithLLM } from '../../src/vision/analyzer.js';
import { config } from '../../src/config.js';

describe('Vision LLM Analyzer', () => {
  const originalEnabled = config.VISION_MODEL_ENABLED;
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    config.VISION_MODEL_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  it('should return fallback message if vision model is disabled', async () => {
    config.VISION_MODEL_ENABLED = false;
    const res = await analyzeScreenshotWithLLM('dummyBase64');
    expect(res).toBe('Vision model disabled.');
  });

  it('should throw error if OPENAI_API_KEY is not set', async () => {
    config.VISION_MODEL_ENABLED = true;
    delete process.env.OPENAI_API_KEY;

    await expect(analyzeScreenshotWithLLM('dummyBase64')).rejects.toThrow(
      'OPENAI_API_KEY environment variable is required'
    );
  });

  it('should format endpoint and return LLM analysis content on success', async () => {
    config.VISION_MODEL_ENABLED = true;
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const mockResponse = {
      choices: [
        {
          message: {
            content: '{"screen_type":"dashboard","summary":"Test dashboard screen"}',
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const res = await analyzeScreenshotWithLLM('data:image/png;base64,testdata');

    expect(fetchSpy).toHaveBeenCalled();
    expect(res).toContain('Test dashboard screen');
  });

  it('should throw error if fetch response is not ok', async () => {
    config.VISION_MODEL_ENABLED = true;
    process.env.OPENAI_API_KEY = 'sk-test-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    await expect(analyzeScreenshotWithLLM('testdata')).rejects.toThrow(
      'Vision model request failed with status 500'
    );
  });

  it('should throw error if response content is empty', async () => {
    config.VISION_MODEL_ENABLED = true;
    process.env.OPENAI_API_KEY = 'sk-test-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    } as Response);

    await expect(analyzeScreenshotWithLLM('testdata')).rejects.toThrow(
      'Empty response content received from vision model.'
    );
  });
});
