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

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  generateImageEmbedding(imageInput: string | Buffer): Promise<number[]>;
  generateTextEmbedding(text: string): Promise<number[]>;
}

export class EmbeddingsManager {
  private processor: any = null;
  private tokenizer: any = null;
  private visionModel: any = null;
  private textModel: any = null;
  private initialized = false;
  private fallbackMode = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized || this.fallbackMode) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const modelSource = config.CLIP_MODEL_PATH || config.CLIP_MODEL;
      logger.info(
        `Loading CLIP embedding model: ${modelSource} (offlineMode=${config.OFFLINE_MODE})...`
      );

      try {
        const modelOpts: any = {
          quantized: true,
        };

        if (config.OFFLINE_MODE) {
          modelOpts.local_files_only = true;
        }

        // Load processor, tokenizer and both CLIP models
        this.processor = await AutoProcessor.from_pretrained(modelSource, modelOpts);
        this.tokenizer = await AutoTokenizer.from_pretrained(modelSource, modelOpts);
        this.visionModel = await CLIPVisionModelWithProjection.from_pretrained(
          modelSource,
          modelOpts
        );
        this.textModel = await CLIPTextModelWithProjection.from_pretrained(modelSource, modelOpts);

        this.initialized = true;
        logger.info('CLIP embedding models loaded successfully.');
      } catch (error: any) {
        logger.warn(
          `Failed to load CLIP embedding model (${error.message || error}). Entering graceful fallback mode (dHash matching enabled, vector features degraded).`
        );
        this.fallbackMode = true;
        this.initialized = false;
      }
    })();

    return this.initPromise;
  }

  get isFallback(): boolean {
    return this.fallbackMode;
  }

  /**
   * Generates a 512-dimension vector embedding for an image buffer.
   */
  async generateImageEmbedding(buffer: Buffer, mimeType: string = 'image/webp'): Promise<number[]> {
    await this.init();

    if (this.fallbackMode || !this.visionModel) {
      logger.debug('EmbeddingsManager operating in fallback mode; returning zero vector.');
      return new Array(config.EMBEDDING_DIMENSIONS).fill(0.0);
    }

    try {
      const blob = new Blob([buffer], { type: mimeType });
      const image = await RawImage.fromBlob(blob);

      const imageInputs = await this.processor(image);
      const visionOutputs = await this.visionModel(imageInputs);
      const embeds = visionOutputs.image_embeds;

      const list = embeds.tolist();
      if (typeof embeds?.dispose === 'function') {
        embeds.dispose();
      }
      return list[0] as number[];
    } catch (error) {
      logger.error('Error generating image embedding, returning zero vector fallback:', error);
      return new Array(config.EMBEDDING_DIMENSIONS).fill(0.0);
    }
  }

  /**
   * Generates a 512-dimension vector embedding for a text query.
   */
  async generateTextEmbedding(text: string): Promise<number[]> {
    await this.init();

    if (this.fallbackMode || !this.textModel) {
      logger.debug('EmbeddingsManager operating in fallback mode; returning zero vector.');
      return new Array(config.EMBEDDING_DIMENSIONS).fill(0.0);
    }

    try {
      const textInputs = await this.tokenizer([text], {
        padding: true,
        truncation: true,
      });

      const textOutputs = await this.textModel(textInputs);
      const embeds = textOutputs.text_embeds;

      const list = embeds.tolist();
      if (typeof embeds?.dispose === 'function') {
        embeds.dispose();
      }
      return list[0] as number[];
    } catch (error) {
      logger.error(`Error generating text embedding for "${text}":`, error);
      return new Array(config.EMBEDDING_DIMENSIONS).fill(0.0);
    }
  }
}

export const embeddings = new EmbeddingsManager();
