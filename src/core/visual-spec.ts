import fs from 'fs';
import path from 'path';
import { storage } from './storage.js';
import { calculateDHash, hammingDistance } from './hash.js';
import { embeddings, cosineSimilarity } from './embeddings.js';
import { processImage } from './image-pipeline.js';
import { logger } from '../logger.js';
import { VisualState } from '../types.js';

export interface VisualSpecResult {
  spec_name: string;
  is_compliant: boolean;
  status: 'pass' | 'visual_drift_detected';
  dhash_distance: number;
  similarity_score: number;
  tolerance_threshold: number;
  message: string;
}

/**
 * Stores a screenshot or design mockup as an explicit Visual Spec baseline.
 */
export async function setVisualSpec(params: {
  name: string;
  screenshot?: string;
  filePath?: string;
  metadata?: Record<string, any>;
}): Promise<{ id: string; name: string; dhash: string }> {
  let base64 = params.screenshot;
  if (params.filePath) {
    if (!fs.existsSync(params.filePath)) {
      throw new Error(`File does not exist: ${params.filePath}`);
    }
    base64 = fs.readFileSync(params.filePath).toString('base64');
  }

  if (!base64) {
    throw new Error('Either screenshot base64 or filePath must be provided.');
  }

  const processed = await processImage(base64);
  const dhash = await calculateDHash(processed.normalizedBuffer);
  const vector = await embeddings.generateImageEmbedding(processed.normalizedBuffer);

  const id = `vspec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const metadata = {
    ...(params.metadata || {}),
    is_visual_spec: true,
    spec_name: params.name,
  };

  const state: VisualState = {
    id,
    dhash,
    ahash: '0'.repeat(64),
    vector,
    description: `Visual Spec: ${params.name}`,
    structured_data: JSON.stringify(metadata),
    accessibility_tree: '{}',
    thumbnail: processed.thumbnail,
    original_dimensions: JSON.stringify({
      width: processed.originalWidth,
      height: processed.originalHeight,
    }),
    source_url: params.filePath || '',
    source_agent: 'system',
    trace_id: '',
    git_branch: '',
    tags: JSON.stringify(['visual_spec']),
    importance_score: 1.0,
    created_at: Date.now(),
    last_accessed: Date.now(),
    access_count: 1,
    ttl: 0,
  };

  await storage.addState(state);

  logger.info(`Visual spec baseline set: "${params.name}" (ID: ${id})`);

  return {
    id,
    name: params.name,
    dhash,
  };
}

/**
 * Verifies a live captured runtime screenshot against a registered Visual Spec baseline.
 */
export async function verifyVisualSpec(params: {
  specName: string;
  screenshot?: string;
  filePath?: string;
  tolerance?: number;
}): Promise<VisualSpecResult> {
  let base64 = params.screenshot;
  if (params.filePath) {
    if (!fs.existsSync(params.filePath)) {
      throw new Error(`File does not exist: ${params.filePath}`);
    }
    base64 = fs.readFileSync(params.filePath).toString('base64');
  }

  if (!base64) {
    throw new Error('Either screenshot base64 or filePath must be provided.');
  }

  const allStates = await storage.listStatesAll();
  const specState = allStates.find((s: VisualState) => {
    try {
      const meta = JSON.parse(s.structured_data || '{}');
      return meta.is_visual_spec && meta.spec_name === params.specName;
    } catch {
      return false;
    }
  });

  if (!specState) {
    throw new Error(`No visual spec baseline found with name: "${params.specName}"`);
  }

  const processed = await processImage(base64);
  const liveDhash = await calculateDHash(processed.normalizedBuffer);
  const liveVector = await embeddings.generateImageEmbedding(processed.normalizedBuffer);

  const distance = hammingDistance(liveDhash, specState.dhash);
  const similarity = specState.vector ? cosineSimilarity(liveVector, specState.vector) : 1.0;

  const threshold = params.tolerance !== undefined ? params.tolerance : 8;
  const isCompliant = distance <= threshold && similarity >= 0.8;

  const status = isCompliant ? 'pass' : 'visual_drift_detected';
  const message = isCompliant
    ? `UI screenshot complies with visual spec "${params.specName}" (Hamming distance ${distance} <= ${threshold}).`
    : `Visual drift detected against spec "${params.specName}"! Hamming distance ${distance} > ${threshold} or similarity ${similarity.toFixed(2)} < 0.80.`;

  return {
    spec_name: params.specName,
    is_compliant: isCompliant,
    status,
    dhash_distance: distance,
    similarity_score: similarity,
    tolerance_threshold: threshold,
    message,
  };
}
