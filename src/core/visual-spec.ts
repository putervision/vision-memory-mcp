import fs from 'fs';
import { storage } from './storage.js';
import { calculateDHash, calculateAHash, hammingDistance } from './hash.js';
import { embeddings, cosineSimilarity } from './embeddings.js';
import { processImage } from './image-pipeline.js';
import { logger } from '../logger.js';
import { VisualState } from '../types.js';
import { VERSION } from '../utils/version.js';

export interface VisualSpecResult {
  spec_name: string;
  is_compliant: boolean;
  status: 'pass' | 'visual_drift_detected';
  dhash_distance: number;
  similarity_score: number;
  tolerance_threshold: number;
  message: string;
  sdd_requirement_id?: string;
  state_memory_tool_calls?: {
    instruction: string;
    mcp_tool_call?: Record<string, unknown>;
    link_tool_call?: Record<string, unknown>;
  };
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

  let stateMemoryToolCalls: any = undefined;
  if (params.sddRequirementId) {
    if (isCompliant) {
      stateMemoryToolCalls = {
        instruction: `Please execute state-memory-mcp:manage_edges (action: "link_visual") to record visual verification for requirement "${params.sddRequirementId}".`,
        link_tool_call: {
          server: 'state-memory-mcp',
          tool: 'manage_edges',
          arguments: {
            action: 'link_visual',
            target_id: params.sddRequirementId,
            visual_state_id: specState.id,
            relationship: 'verifies_visual_state',
            visual_description: `Visual Spec: ${params.specName}`,
          },
        },
      };
    } else {
      stateMemoryToolCalls = {
        instruction: `Please execute state-memory-mcp:manage_nodes (action: "create") to log a visual drift blocker, and state-memory-mcp:manage_edges (action: "link_visual") to link it to requirement "${params.sddRequirementId}".`,
        mcp_tool_call: {
          server: 'state-memory-mcp',
          tool: 'manage_nodes',
          arguments: {
            action: 'create',
            type: 'blocker',
            title: `Visual Drift Blocker: Spec "${params.specName}" failed (distance ${distance} > ${threshold})`,
            status: 'active',
            metadata: {
              spec_name: params.specName,
              sdd_requirement_id: params.sddRequirementId,
              dhash_distance: distance,
              similarity_score: similarity,
              spec_state_id: specState.id,
            },
            tags: ['visual-regression', 'sdd-drift'],
          },
        },
        link_tool_call: {
          server: 'state-memory-mcp',
          tool: 'manage_edges',
          arguments: {
            action: 'link_visual',
            target_id: params.sddRequirementId,
            visual_state_id: specState.id,
            relationship: 'blocked_by_visual_state',
            visual_description: `Visual Drift: Spec "${params.specName}"`,
          },
        },
      };
    }
  }

  return {
    spec_name: params.specName,
    is_compliant: isCompliant,
    status,
    dhash_distance: distance,
    similarity_score: similarity,
    tolerance_threshold: threshold,
    message,
    sdd_requirement_id: params.sddRequirementId,
    state_memory_tool_calls: stateMemoryToolCalls,
  };
}

export interface VisualSpecInfo {
  id: string;
  name: string;
  dhash: string;
  ahash: string;
  created_at: number;
  source_url?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Lists all registered Visual Spec baselines across the project.
 */
export async function listVisualSpecs(): Promise<VisualSpecInfo[]> {
  const allStates = await storage.listStatesAll();
  const specs: VisualSpecInfo[] = [];

  for (const s of allStates) {
    try {
      const meta = JSON.parse(s.structured_data || '{}');
      if (meta.is_visual_spec) {
        specs.push({
          id: s.id,
          name: meta.spec_name || s.id.replace('spec-', ''),
          dhash: s.dhash,
          ahash: s.ahash,
          created_at: s.created_at,
          source_url: s.source_url,
          metadata: meta,
        });
      }
    } catch {}
  }

  return specs;
}

/**
 * Exports all registered Visual Spec baselines to a JSON manifest suite file.
 */
export async function exportVisualSpecSuite(outputPath?: string): Promise<{
  spec_count: number;
  specs: VisualSpecInfo[];
  manifest_path: string;
}> {
  const specs = await listVisualSpecs();
  const targetPath =
    outputPath || `${process.env.LANCEDB_PATH || '.vision-memory-mcp'}/specs-manifest.json`;

  const payload = {
    version: VERSION,
    generated_at: new Date().toISOString(),
    spec_count: specs.length,
    specs,
  };

  const fs = await import('fs');
  const path = await import('path');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));

  return {
    spec_count: specs.length,
    specs,
    manifest_path: targetPath,
  };
}
