import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Interface for the vision model analyzer.
 */
export async function analyzeScreenshotWithLLM(base64Image: string): Promise<string> {
  if (!config.VISION_MODEL_ENABLED) {
    logger.debug('Vision model analyzer is disabled. Skipping LLM analysis.');
    return 'Vision model disabled.';
  }

  // Ensure base64 prefix
  const formattedBase64 = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/webp;base64,${base64Image}`;

  let endpoint = config.VISION_MODEL_ENDPOINT;
  if (!endpoint.includes('chat/completions')) {
    endpoint = endpoint.endsWith('/')
      ? `${endpoint}chat/completions`
      : `${endpoint}/chat/completions`;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required for vision analysis.');
  }

  logger.info(`Sending image to vision LLM at ${endpoint} using model ${config.VISION_MODEL_NAME}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.VISION_MODEL_NAME,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this screenshot of a user interface. Return ONLY a valid JSON object with the following schema:\n{\n  "screen_type": "form_edit" | "dashboard" | "modal_dialog" | "error_page" | "list_view" | "other",\n  "page_title": "visible heading or title",\n  "key_interactive_elements": [{"label": "button or field name", "type": "button|input|link|etc", "state": "enabled|disabled|filled"}],\n  "active_alerts": ["error or warning text if present"],\n  "summary": "concise single-sentence description of the layout and purpose"\n}',
              },
              {
                type: 'image_url',
                image_url: {
                  url: formattedBase64,
                },
              },
            ],
          },
        ],
        max_tokens: config.VISION_MODEL_MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision model request failed with status ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response content received from vision model.');
    }

    return content.trim();
  } catch (error) {
    logger.error('Error in vision LLM analysis:', error);
    throw error;
  }
}
