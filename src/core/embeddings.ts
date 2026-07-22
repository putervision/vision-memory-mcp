import {
  AutoProcessor,
  AutoTokenizer,
  CLIPVisionModelWithProjection,
  CLIPTextModelWithProjection,
  RawImage,
} from '@huggingface/transformers';
import { config } from '../config.js';
import { logger } from '../logger.js';

export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class EmbeddingsManager {
  private processor: any = null;
  private tokenizer: any = null;
  private visionModel: any = null;
  private textModel: any = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      logger.info(
        `Loading CLIP embedding model: ${config.CLIP_MODEL} (first run may download ~90MB)...`
      );
      try {
        const modelOpts = {
          quantized: true,
        };

        // Load processor, tokenizer and both CLIP models
        this.processor = await AutoProcessor.from_pretrained(config.CLIP_MODEL);
        this.tokenizer = await AutoTokenizer.from_pretrained(config.CLIP_MODEL);
        this.visionModel = await CLIPVisionModelWithProjection.from_pretrained(
          config.CLIP_MODEL,
          modelOpts as any
        );
        this.textModel = await CLIPTextModelWithProjection.from_pretrained(
          config.CLIP_MODEL,
          modelOpts as any
        );

        this.initialized = true;
        logger.info('CLIP embedding models loaded successfully.');
      } catch (error) {
        logger.error('Failed to load CLIP embedding models:', error);
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Generates a 512-dimension vector embedding for an image buffer.
   */
  async generateImageEmbedding(
    buffer: Buffer,
    mimeType: string = 'image/webp'
  ): Promise<number[]> {
    await this.init();

    try {
      // Convert buffer to Blob using specified or default mimeType
      const blob = new Blob([buffer], { type: mimeType });
      const image = await RawImage.fromBlob(blob);

      // Process image
      const imageInputs = await this.processor(image);

      // Run inference
      const visionOutputs = await this.visionModel(imageInputs);
      const embeds = visionOutputs.image_embeds;

      // Extract raw data array [0] (batch dimension = 1)
      const list = embeds.tolist();
      if (typeof embeds?.dispose === 'function') {
        embeds.dispose();
      }
      return list[0] as number[];
    } catch (error) {
      logger.error('Error generating image embedding:', error);
      throw error;
    }
  }

  /**
   * Generates a 512-dimension vector embedding for a text query.
   */
  async generateTextEmbedding(text: string): Promise<number[]> {
    await this.init();

    try {
      // Process text
      const textInputs = await this.tokenizer([text], {
        padding: true,
        truncation: true,
      });

      // Run inference
      const textOutputs = await this.textModel(textInputs);
      const embeds = textOutputs.text_embeds;

      // Extract raw data array [0]
      const list = embeds.tolist();
      if (typeof embeds?.dispose === 'function') {
        embeds.dispose();
      }
      return list[0] as number[];
    } catch (error) {
      logger.error(`Error generating text embedding for "${text}":`, error);
      throw error;
    }
  }
}

export const embeddings = new EmbeddingsManager();
