import fs from 'fs';
import crypto from 'crypto';
import { storage } from '../../core/storage.js';

export async function runQuery(args: string[]) {
  const imgPath = args[1] === 'query' ? args[2] : args[1];
  if (!imgPath || imgPath.startsWith('--')) {
    console.error('Error: Please specify the image file path to query.');
    process.exit(1);
  }

  if (!fs.existsSync(imgPath)) {
    console.error(`Error: Image file does not exist: ${imgPath}`);
    process.exit(1);
  }

  await storage.init();
  const { retrieveState } = await import('../../core/retrieval.js');
  const { getCurrentBranch } = await import('../../core/cache.js');

  try {
    const imgBuffer = fs.readFileSync(imgPath);
    const result = await retrieveState({
      screenshot: imgBuffer,
      strategy: 'thorough',
      gitBranch: getCurrentBranch(),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('Failed to query visual cache:', err.message);
    process.exit(1);
  }
}

export async function runIngest(args: string[]) {
  const isTargetCommand = args[1] === 'ingest';
  const imgPath = isTargetCommand ? args[2] : args[1];
  const description = isTargetCommand
    ? args.slice(3).join(' ')
    : args.slice(2).join(' ');

  if (!imgPath || imgPath.startsWith('--')) {
    console.error('Error: Please specify the image file path to ingest.');
    process.exit(1);
  }

  if (!description) {
    console.error('Error: Please specify a description for the layout.');
    process.exit(1);
  }

  if (!fs.existsSync(imgPath)) {
    console.error(`Error: Image file does not exist: ${imgPath}`);
    process.exit(1);
  }

  await storage.init();
  const { embeddings } = await import('../../core/embeddings.js');
  await embeddings.init();
  const { processImage } = await import('../../core/image-pipeline.js');
  const { calculateDHash, calculateAHash } = await import('../../core/hash.js');
  const { getCurrentBranch } = await import('../../core/cache.js');

  try {
    console.log(`Ingesting visual state from "${imgPath}"...`);
    const imgBuffer = fs.readFileSync(imgPath);
    const processed = await processImage(imgBuffer);
    const dhash = await calculateDHash(processed.normalizedBuffer);
    const ahash = await calculateAHash(processed.normalizedBuffer);
    const vector = await embeddings.generateImageEmbedding(
      processed.normalizedBuffer
    );

    const stateId = crypto.randomUUID();
    const newState = {
      id: stateId,
      dhash,
      ahash,
      vector,
      description,
      structured_data: '{}',
      accessibility_tree: '{}',
      thumbnail: processed.thumbnail,
      original_dimensions: JSON.stringify({
        width: processed.originalWidth,
        height: processed.originalHeight,
      }),
      source_url: 'app://cli',
      source_agent: 'cli-user',
      trace_id: 'cli-ingest',
      git_branch: getCurrentBranch(),
      tags: JSON.stringify(['cli-manual']),
      importance_score: 0.5,
      created_at: Date.now(),
      last_accessed: Date.now(),
      access_count: 1,
      ttl: 0,
    };

    await storage.addState(newState);
    console.log(
      JSON.stringify({ success: true, state_id: stateId, description })
    );
  } catch (err: any) {
    console.error('Failed to ingest visual state:', err.message);
    process.exit(1);
  }
}
