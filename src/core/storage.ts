import * as lancedb from '@lancedb/lancedb';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { VisualState, StateTransition, VisualSnapshot } from '../types.js';

// Helper to clean up lock files recursively
function cleanupLockFiles(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      cleanupLockFiles(fullPath);
    } else if (file.includes('lock') || file.endsWith('.lock') || file.includes('write.lock')) {
      try {
        fs.unlinkSync(fullPath);
        logger.debug(`Cleaned up stale lock file: ${fullPath}`);
      } catch (err) {
        logger.debug(`Could not remove lock file ${fullPath}:`, err);
      }
    }
  }
}

export class StorageManager {
  private db: lancedb.Connection | null = null;
  private statesTable: lancedb.Table | null = null;
  private transitionsTable: lancedb.Table | null = null;
  private snapshotsTable: lancedb.Table | null = null;

  async init(customDbPath?: string): Promise<void> {
    const dbPath = customDbPath ?? config.LANCEDB_PATH;
    logger.info(`Initializing LanceDB storage at: ${dbPath}`);

    // Create database directory if missing
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    } else {
      // Clean up stale lock files from crashes
      cleanupLockFiles(dbPath);
    }

    try {
      this.db = await lancedb.connect(dbPath);
      await this.initTables();
      logger.info('LanceDB storage initialized successfully.');
    } catch (error) {
      logger.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  private async initTables(): Promise<void> {
    if (!this.db) throw new Error('Database connection not established.');

    const tableNames = await this.db.tableNames();

    // 1. Initialize Visual States Table
    if (tableNames.includes('visual_states')) {
      this.statesTable = await this.db.openTable('visual_states');
    } else {
      logger.info('Creating new visual_states table...');
      const dummyVector = new Array(config.EMBEDDING_DIMENSIONS).fill(0.0);
      const dummyState: VisualState = {
        id: 'dummy-state-id',
        dhash: '0'.repeat(64),
        ahash: '0'.repeat(64),
        vector: dummyVector,
        description: 'dummy',
        structured_data: '{}',
        accessibility_tree: '{}',
        thumbnail: '',
        original_dimensions: '{"width":0,"height":0}',
        source_url: '',
        source_agent: '',
        trace_id: '',
        git_branch: '',
        tags: '[]',
        importance_score: 0.0,
        created_at: 0,
        last_accessed: 0,
        access_count: 0,
        ttl: 0,
      };

      this.statesTable = await this.db.createTable('visual_states', [dummyState as any], { mode: 'overwrite' });
      await this.statesTable.delete("id = 'dummy-state-id'");
      logger.debug('Created and cleaned visual_states table.');
    }

    // 2. Initialize State Transitions Table
    if (tableNames.includes('state_transitions')) {
      this.transitionsTable = await this.db.openTable('state_transitions');
    } else {
      logger.info('Creating new state_transitions table...');
      const dummyTransition: StateTransition = {
        id: 'dummy-transition-id',
        from_state_id: 'dummy',
        to_state_id: 'dummy',
        action: 'dummy',
        action_type: 'custom',
        success: 0,
        success_count: 0,
        failure_count: 0,
        duration_ms: 0,
        last_traversed: 0,
        git_branch: '',
        metadata: '{}',
      };

      this.transitionsTable = await this.db.createTable('state_transitions', [dummyTransition as any], { mode: 'overwrite' });
      await this.transitionsTable.delete("id = 'dummy-transition-id'");
      logger.debug('Created and cleaned state_transitions table.');
    }

    // 3. Initialize Visual Snapshots Table
    if (tableNames.includes('visual_snapshots')) {
      this.snapshotsTable = await this.db.openTable('visual_snapshots');
    } else {
      logger.info('Creating new visual_snapshots table...');
      const dummySnapshot: VisualSnapshot = {
        id: 'dummy-snapshot-id',
        name: 'dummy',
        description: 'dummy',
        git_branch: '',
        created_at: 0,
        state_ids: '[]',
      };

      this.snapshotsTable = await this.db.createTable('visual_snapshots', [dummySnapshot as any], { mode: 'overwrite' });
      await this.snapshotsTable.delete("id = 'dummy-snapshot-id'");
      logger.debug('Created and cleaned visual_snapshots table.');
    }

    // Create scalar indexes to speed up lookups
    try {
      if (this.statesTable) {
        await (this.statesTable as any).createScalarIndex('dhash', { indexType: 'btree' });
        await (this.statesTable as any).createScalarIndex('git_branch', { indexType: 'bitmap' });
      }
    } catch (err) {
      logger.debug('Scalar indexes for visual_states already exist or failed:', err);
    }

    try {
      if (this.transitionsTable) {
        await (this.transitionsTable as any).createScalarIndex('from_state_id', { indexType: 'btree' });
        await (this.transitionsTable as any).createScalarIndex('to_state_id', { indexType: 'btree' });
        await (this.transitionsTable as any).createScalarIndex('git_branch', { indexType: 'bitmap' });
      }
    } catch (err) {
      logger.debug('Scalar indexes for state_transitions already exist or failed:', err);
    }
  }

  // --- Visual States Operations ---

  async addState(state: VisualState): Promise<void> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    logger.debug(`Inserting visual state: ${state.id}`);
    await this.statesTable.add([state as any]);
  }

  async getState(id: string): Promise<VisualState | null> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    const results = await this.statesTable.query().where(`id = '${id}'`).limit(1).toArray();
    return results.length > 0 ? (results[0] as unknown as VisualState) : null;
  }

  async updateState(id: string, updates: Partial<Omit<VisualState, 'id'>>): Promise<void> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    logger.debug(`Updating visual state: ${id}`);
    await this.statesTable.update({
      where: `id = '${id}'`,
      values: updates,
    });
  }

  async deleteState(id: string): Promise<void> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    logger.debug(`Deleting visual state: ${id}`);
    await this.statesTable.delete(`id = '${id}'`);
  }

  async listStates(filter?: string, limit: number = 50): Promise<VisualState[]> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    let q = this.statesTable.query();
    if (filter) {
      q = q.where(filter);
    }
    const results = await q.limit(limit).toArray();
    return results as unknown as VisualState[];
  }

  async searchVector(vector: number[], limit: number, filter?: string): Promise<VisualState[]> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    let search = this.statesTable.search(vector);
    if (filter) {
      search = search.where(filter);
    }
    const results = await search.limit(limit).toArray();
    return results as unknown as VisualState[];
  }

  // --- State Transitions Operations ---

  async addTransition(transition: StateTransition): Promise<void> {
    if (!this.transitionsTable) throw new Error('Transitions table not initialized.');
    logger.debug(`Upserting transition: ${transition.id} (${transition.from_state_id} -> ${transition.to_state_id})`);
    
    // Set unenforced primary key if LanceDB requires (usually handled during execution of mergeInsert)
    // We run mergeInsert on 'id' column
    await this.transitionsTable.mergeInsert('id')
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute([transition as any]);
  }

  async getTransition(id: string): Promise<StateTransition | null> {
    if (!this.transitionsTable) throw new Error('Transitions table not initialized.');
    const results = await this.transitionsTable.query().where(`id = '${id}'`).limit(1).toArray();
    return results.length > 0 ? (results[0] as unknown as StateTransition) : null;
  }

  async listTransitions(filter?: string, limit: number = 100): Promise<StateTransition[]> {
    if (!this.transitionsTable) throw new Error('Transitions table not initialized.');
    let q = this.transitionsTable.query();
    if (filter) {
      q = q.where(filter);
    }
    const results = await q.limit(limit).toArray();
    return results as unknown as StateTransition[];
  }

  async deleteTransition(id: string): Promise<void> {
    if (!this.transitionsTable) throw new Error('Transitions table not initialized.');
    logger.debug(`Deleting transition: ${id}`);
    await this.transitionsTable.delete(`id = '${id}'`);
  }

  // --- Visual Snapshots Operations ---

  async addSnapshot(snapshot: VisualSnapshot): Promise<void> {
    if (!this.snapshotsTable) throw new Error('Snapshots table not initialized.');
    logger.debug(`Inserting snapshot: ${snapshot.name} (${snapshot.id})`);
    await this.snapshotsTable.add([snapshot as any]);
  }

  async getSnapshot(idOrName: string): Promise<VisualSnapshot | null> {
    if (!this.snapshotsTable) throw new Error('Snapshots table not initialized.');
    // Check by ID first, then by name
    let results = await this.snapshotsTable.query().where(`id = '${idOrName}'`).limit(1).toArray();
    if (results.length === 0) {
      results = await this.snapshotsTable.query().where(`name = '${idOrName}'`).limit(1).toArray();
    }
    return results.length > 0 ? (results[0] as unknown as VisualSnapshot) : null;
  }

  async listSnapshots(limit: number = 50): Promise<VisualSnapshot[]> {
    if (!this.snapshotsTable) throw new Error('Snapshots table not initialized.');
    const results = await this.snapshotsTable.query().limit(limit).toArray();
    return results as unknown as VisualSnapshot[];
  }

  async deleteSnapshot(id: string): Promise<void> {
    if (!this.snapshotsTable) throw new Error('Snapshots table not initialized.');
    logger.debug(`Deleting snapshot: ${id}`);
    await this.snapshotsTable.delete(`id = '${id}'`);
  }

  // --- Maintenance & Indexing ---

  async createVectorIndex(): Promise<void> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    
    // In LanceDB, IVF_PQ index requires a certain amount of data to be present (typically > 1000 rows).
    // The node-lancedb SDK allows creating indices. Let's do it safely.
    const count = (await this.statesTable.query().toArray()).length;
    if (count < 256) {
      logger.info(`Skipping vector index creation. Current row count (${count}) is too low (requires ~256+ rows for training).`);
      return;
    }
    
    logger.info('Creating IVF_PQ vector index on visual_states...');
    try {
      await this.statesTable.createIndex('vector', {
        type: 'vector',
        metric: 'cosine',
        numPartitions: 8,
        numSubVectors: 8,
      } as any);
      logger.info('Vector index created successfully.');
    } catch (err) {
      logger.error('Failed to create vector index:', err);
    }
  }

  async optimize(): Promise<void> {
    logger.info('Compacting LanceDB tables (running optimize)...');
    try {
      if (this.statesTable) {
        await this.statesTable.optimize();
        logger.debug('Optimized visual_states table.');
      }
      if (this.transitionsTable) {
        await this.transitionsTable.optimize();
        logger.debug('Optimized state_transitions table.');
      }
      if (this.snapshotsTable) {
        await this.snapshotsTable.optimize();
        logger.debug('Optimized visual_snapshots table.');
      }
      logger.info('LanceDB optimization completed successfully.');
    } catch (err) {
      logger.error('Failed to optimize database:', err);
    }
  }
}

export const storage = new StorageManager();
export function transitionKey(fromId: string, toId: string, action: string): string {
  return crypto.createHash('sha256')
    .update(`${fromId}:${toId}:${action}`)
    .digest('hex')
    .slice(0, 32);
}
