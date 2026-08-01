import fs from 'fs';
import { storage } from './storage.js';
import { calculateDHash, calculateAHash, hammingDistance } from './hash.js';
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
  sdd_requirement_id?: string;
}

/**
 * Stores a screenshot or design mockup as an explicit Visual Spec baseline.
 */
export async function setVisualSpec(params: {
  name: string;
  screenshot?: string;
  filePath?: string;
  metadata?: Record<string, unknown>;
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
  const ahash = await calculateAHash(processed.normalizedBuffer);
  const vector = await embeddings.generateImageEmbedding(processed.normalizedBuffer);

  const stateId = `spec-${params.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
  const now = Date.now();

  const state: VisualState = {
    id: stateId,
    dhash,
    ahash,
    vector,
    description: `Visual Spec Baseline: ${params.name}`,
    structured_data: JSON.stringify({
      is_visual_spec: true,
      spec_name: params.name,
      ...params.metadata,
    }),
    accessibility_tree: '',
    thumbnail: processed.thumbnail,
    original_dimensions: JSON.stringify({
      width: processed.width,
      height: processed.height,
    }),
    source_url: `spec://${params.name}`,
    source_agent: 'system',
    trace_id: 'spec-baseline',
    git_branch: 'main',
    tags: JSON.stringify(['visual-spec', 'baseline', params.name]),
    importance_score: 1.0,
    created_at: now,
    last_accessed: now,
    access_count: 1,
    ttl: 0,
  };

  await storage.addState(state);
  logger.info(`Registered Visual Spec baseline "${params.name}" (ID: ${stateId})`);

  return {
    id: stateId,
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
  sddRequirementId?: string;
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

  const isZeroVec = (v?: any) => {
    if (!v) return true;
    const arr = Array.from(v) as number[];
    if (arr.length === 0) return true;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== 0) return false;
    }
    return true;
  };
  const distance = hammingDistance(liveDhash, specState.dhash);
  const rawSim =
    isZeroVec(liveVector) || isZeroVec(specState.vector)
      ? 1.0
      : cosineSimilarity(liveVector, specState.vector);
  const similarity = isNaN(rawSim) ? 1.0 : rawSim;

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
    sdd_requirement_id: params.sddRequirementId,
  };
}
