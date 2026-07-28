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

export function escapeSql(val: string): string {
  if (typeof val !== 'string') {
    return '';
  }
  return val
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\0/g, '\\0');
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 4,
  baseDelayMs = 50
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isConflict =
        errMsg.includes('Commit conflict') ||
        errMsg.includes('concurrent commit') ||
        errMsg.includes('write.lock');
      if (isConflict && attempt < maxRetries) {
        attempt++;
        const jitter = Math.floor(Math.random() * 50);
        const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
        logger.debug(
          `LanceDB write conflict detected (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

function getDirSize(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += getDirSize(filePath);
        } else {
          size += stats.size;
        }
      } catch {}
    }
  } catch {}
  return size;
}

export class StorageManager {
  private db: lancedb.Connection | null = null;
  private statesTable: lancedb.Table | null = null;
  private transitionsTable: lancedb.Table | null = null;
  private snapshotsTable: lancedb.Table | null = null;
  private auxiliaryDbs = new Map<
    string,
    { db: lancedb.Connection; statesTable: lancedb.Table | null }
  >();
  private compactionFailures = 0;
  private circuitTrippedUntil = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  private async enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const res = this.writeQueue.then(() => withRetry(task));
    this.writeQueue = res.then(
      () => {},
      () => {}
    );
    return res;
  }

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
      const { checkAndRunSchemaMigrations } = await import('./migrations.js');
      await checkAndRunSchemaMigrations();

      this.db = await lancedb.connect(dbPath);
      await this.initTables();
      await this.createVectorIndex().catch((err) => {
        logger.debug('Auto vector index check skipped or failed:', err);
      });
      await this.initAuxiliaryDatabases();
      logger.info('LanceDB storage initialized successfully.');
    } catch (error) {
      logger.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  async initAuxiliaryDatabases(rootDir: string = process.cwd()): Promise<void> {
    try {
      const { discoverSubMemoryDatabases } = await import('../utils/workspace.js');
      const dbs = discoverSubMemoryDatabases(rootDir);
      const primaryPath = path.resolve(config.LANCEDB_PATH);

      for (const d of dbs) {
        const resolvedPath = path.resolve(d.path);
        if (resolvedPath === primaryPath || this.auxiliaryDbs.has(resolvedPath)) {
          continue;
        }

        try {
          cleanupLockFiles(resolvedPath);
          const auxDb = await lancedb.connect(resolvedPath);
          const tables = await auxDb.tableNames();
          let statesTable: lancedb.Table | null = null;
          if (tables.includes('visual_states')) {
            statesTable = await auxDb.openTable('visual_states');
          }
          this.auxiliaryDbs.set(resolvedPath, { db: auxDb, statesTable });
          logger.info(`Connected to auxiliary sub-directory database: ${d.relativePath}`);
        } catch (err) {
          logger.debug(`Could not connect to auxiliary database at ${resolvedPath}:`, err);
        }
      }
    } catch (err) {
      logger.debug('Auxiliary database discovery skipped:', err);
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

      this.statesTable = await this.db.createTable('visual_states', [dummyState as any], {
        mode: 'overwrite',
      });
      try {
        await this.statesTable.delete("id = 'dummy-state-id'");
      } catch {}
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

      this.transitionsTable = await this.db.createTable(
        'state_transitions',
        [dummyTransition as any],
        { mode: 'overwrite' }
      );
      try {
        await this.transitionsTable.delete("id = 'dummy-transition-id'");
      } catch {}
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

      this.snapshotsTable = await this.db.createTable('visual_snapshots', [dummySnapshot as any], {
        mode: 'overwrite',
      });
      try {
        await this.snapshotsTable.delete("id = 'dummy-snapshot-id'");
      } catch {}
      logger.debug('Created and cleaned visual_snapshots table.');
    }

    // Create scalar indexes to speed up lookups
    try {
      if (this.statesTable) {
        await (this.statesTable as any).createScalarIndex('dhash', {
          indexType: 'btree',
        });
        await (this.statesTable as any).createScalarIndex('git_branch', {
          indexType: 'bitmap',
        });
      }
    } catch (err) {
      logger.debug('Scalar indexes for visual_states already exist or failed:', err);
    }

    try {
      if (this.transitionsTable) {
        await (this.transitionsTable as any).createScalarIndex('from_state_id', {
          indexType: 'btree',
        });
        await (this.transitionsTable as any).createScalarIndex('to_state_id', {
          indexType: 'btree',
        });
        await (this.transitionsTable as any).createScalarIndex('git_branch', {
          indexType: 'bitmap',
        });
      }
    } catch (err) {
      logger.debug('Scalar indexes for state_transitions already exist or failed:', err);
    }
  }

  async checkStorageSizeAndEvict(): Promise<void> {
    const maxBytes = config.MAX_LANCEDB_SIZE_MB * 1024 * 1024;
    const currentSize = getDirSize(config.LANCEDB_PATH);
    if (currentSize <= maxBytes) return;

    logger.warn(
      `Storage size (${(currentSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit of ${config.MAX_LANCEDB_SIZE_MB}MB. Triggering LRU eviction...`
    );

    const targetBytes = maxBytes * 0.8;
    const states = await this.listStates(undefined, 10000);
    states.sort((a, b) => a.last_accessed - b.last_accessed);

    let evictedCount = 0;
    for (const s of states) {
      if (getDirSize(config.LANCEDB_PATH) <= targetBytes) break;
      try {
        await this.deleteState(s.id);
        evictedCount++;
      } catch (err) {
        logger.debug(`Failed to evict state ${s.id}:`, err);
      }
    }
    logger.info(`Evicted ${evictedCount} visual states to reduce LanceDB storage size.`);
  }

  // --- Visual States Operations ---

  async addState(state: VisualState): Promise<void> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    logger.debug(`Inserting visual state: ${state.id}`);
    await this.enqueueWrite(async () => {
      await this.statesTable!.add([state as any]);
    });
    this.checkStorageSizeAndEvict().catch((err) =>
      logger.debug('Storage size check/eviction deferred error:', err)
    );
  }

  async getState(id: string): Promise<VisualState | null> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    const safeId = escapeSql(id);
    const results = await this.statesTable.query().where(`id = '${safeId}'`).limit(1).toArray();
    return results.length > 0 ? (results[0] as unknown as VisualState) : null;
  }

  async getStateAll(id: string): Promise<VisualState | null> {
    const primary = await this.getState(id);
    if (primary) return primary;

    const safeId = escapeSql(id);
    for (const aux of this.auxiliaryDbs.values()) {
      if (!aux.statesTable) continue;
      try {
        const results = await aux.statesTable.query().where(`id = '${safeId}'`).limit(1).toArray();
        if (results.length > 0) {
          return results[0] as unknown as VisualState;
        }
      } catch (err) {
        logger.debug(`Failed to getState from auxiliary db:`, err);
      }
    }
    return null;
  }

  async updateState(id: string, updates: Partial<Omit<VisualState, 'id'>>): Promise<void> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    logger.debug(`Updating visual state: ${id}`);
    const safeId = escapeSql(id);
    await withRetry(async () => {
      await this.statesTable!.update({
        where: `id = '${safeId}'`,
        values: updates,
      });
    });
  }

  async deleteState(id: string): Promise<void> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    logger.debug(`Deleting visual state: ${id}`);
    const safeId = escapeSql(id);
    await withRetry(async () => {
      await this.statesTable!.delete(`id = '${safeId}'`);
      if (this.transitionsTable) {
        logger.debug(`Cascading delete: removing transitions for state ${id}`);
        await this.transitionsTable.delete(
          `from_state_id = '${safeId}' OR to_state_id = '${safeId}'`
        );
      }
    });
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

  async listStatesAll(filter?: string, limit: number = 50): Promise<VisualState[]> {
    const combined: VisualState[] = [];
    const primary = await this.listStates(filter, limit);
    combined.push(...primary);

    for (const [dbPath, aux] of this.auxiliaryDbs.entries()) {
      if (!aux.statesTable) continue;
      try {
        let q = aux.statesTable.query();
        if (filter) {
          q = q.where(filter);
        }
        const auxStates = (await q.limit(limit).toArray()) as unknown as VisualState[];
        const relativeSubdir = path.relative(process.cwd(), path.dirname(dbPath));
        for (const s of auxStates) {
          (s as any).source_subdir = relativeSubdir || '.';
        }
        combined.push(...auxStates);
      } catch (err) {
        logger.debug(`Failed to query auxiliary states from ${dbPath}:`, err);
      }
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    const deduplicated: VisualState[] = [];
    for (const s of combined) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        deduplicated.push(s);
      }
    }
    return deduplicated.slice(0, limit);
  }

  async countStates(filter?: string): Promise<number> {
    if (!this.statesTable) throw new Error('States table not initialized.');
    return await this.statesTable.countRows(filter);
  }

  async countStatesAll(filter?: string): Promise<number> {
    let total = await this.countStates(filter);
    for (const aux of this.auxiliaryDbs.values()) {
      if (aux.statesTable) {
        try {
          total += await aux.statesTable.countRows(filter);
        } catch {}
      }
    }
    return total;
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

  async searchVectorAll(vector: number[], limit: number, filter?: string): Promise<VisualState[]> {
    const combined: VisualState[] = [];
    const primary = await this.searchVector(vector, limit, filter);
    combined.push(...primary);

    for (const [dbPath, aux] of this.auxiliaryDbs.entries()) {
      if (!aux.statesTable) continue;
      try {
        let search = aux.statesTable.search(vector);
        if (filter) {
          search = search.where(filter);
        }
        const auxMatches = (await search.limit(limit).toArray()) as unknown as VisualState[];
        const relativeSubdir = path.relative(process.cwd(), path.dirname(dbPath));
        for (const s of auxMatches) {
          (s as any).source_subdir = relativeSubdir || '.';
        }
        combined.push(...auxMatches);
      } catch (err) {
        logger.debug(`Failed to search vector on auxiliary database ${dbPath}:`, err);
      }
    }

    // Sort by LanceDB _distance if present
    combined.sort((a, b) => {
      const distA = (a as any)._distance ?? 2;
      const distB = (b as any)._distance ?? 2;
      return distA - distB;
    });

    // Deduplicate by ID
    const seen = new Set<string>();
    const deduplicated: VisualState[] = [];
    for (const s of combined) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        deduplicated.push(s);
      }
    }
    return deduplicated.slice(0, limit);
  }

  // --- State Transitions Operations ---

  async addTransition(transition: StateTransition): Promise<void> {
    if (!this.transitionsTable) throw new Error('Transitions table not initialized.');
    logger.debug(
      `Upserting transition: ${transition.id} (${transition.from_state_id} -> ${transition.to_state_id})`
    );

    await withRetry(async () => {
      await this.transitionsTable!.mergeInsert('id')
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute([transition as any]);
    });
  }

  async getTransition(id: string): Promise<StateTransition | null> {
    if (!this.transitionsTable) throw new Error('Transitions table not initialized.');
    const safeId = escapeSql(id);
    const results = await this.transitionsTable
      .query()
      .where(`id = '${safeId}'`)
      .limit(1)
      .toArray();
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

  async listTransitionsAll(filter?: string, limit: number = 100): Promise<StateTransition[]> {
    const combined: StateTransition[] = [];
    const primary = await this.listTransitions(filter, limit);
    combined.push(...primary);

    for (const aux of this.auxiliaryDbs.values()) {
      if (!aux.db) continue;
      try {
        const tables = await aux.db.tableNames();
        if (!tables.includes('state_transitions')) continue;
        const auxTable = await aux.db.openTable('state_transitions');
        let q = auxTable.query();
        if (filter) q = q.where(filter);
        const auxTransitions = (await q.limit(limit).toArray()) as unknown as StateTransition[];
        combined.push(...auxTransitions);
      } catch (err) {
        logger.debug(`Failed to query auxiliary transitions:`, err);
      }
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    const deduplicated: StateTransition[] = [];
    for (const t of combined) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        deduplicated.push(t);
      }
    }
    return deduplicated.slice(0, limit);
  }

  async countTransitions(filter?: string): Promise<number> {
    if (!this.transitionsTable) throw new Error('Transitions table not initialized.');
    return await this.transitionsTable.countRows(filter);
  }

  async countTransitionsAll(filter?: string): Promise<number> {
    let total = await this.countTransitions(filter);
    for (const aux of this.auxiliaryDbs.values()) {
      try {
        const tables = await aux.db.tableNames();
        if (tables.includes('state_transitions')) {
          const auxTable = await aux.db.openTable('state_transitions');
          total += await auxTable.countRows(filter);
        }
      } catch {}
    }
    return total;
  }

  async deleteTransition(id: string): Promise<void> {
    if (!this.transitionsTable) throw new Error('Transitions table not initialized.');
    logger.debug(`Deleting transition: ${id}`);
    const safeId = escapeSql(id);
    await withRetry(async () => {
      await this.transitionsTable!.delete(`id = '${safeId}'`);
    });
  }

  // --- Visual Snapshots Operations ---

  async addSnapshot(snapshot: VisualSnapshot): Promise<void> {
    if (!this.snapshotsTable) throw new Error('Snapshots table not initialized.');
    logger.debug(`Inserting snapshot: ${snapshot.name} (${snapshot.id})`);
    await withRetry(async () => {
      await this.snapshotsTable!.add([snapshot as any]);
    });
  }

  async getSnapshot(idOrName: string): Promise<VisualSnapshot | null> {
    if (!this.snapshotsTable) throw new Error('Snapshots table not initialized.');
    const safeIdOrName = escapeSql(idOrName);
    let results = await this.snapshotsTable
      .query()
      .where(`id = '${safeIdOrName}'`)
      .limit(1)
      .toArray();
    if (results.length === 0) {
      results = await this.snapshotsTable
        .query()
        .where(`name = '${safeIdOrName}'`)
        .limit(1)
        .toArray();
    }
    return results.length > 0 ? (results[0] as unknown as VisualSnapshot) : null;
  }

  async getSnapshotAll(idOrName: string): Promise<VisualSnapshot | null> {
    const primary = await this.getSnapshot(idOrName);
    if (primary) return primary;

    const safeIdOrName = escapeSql(idOrName);
    for (const aux of this.auxiliaryDbs.values()) {
      try {
        const tables = await aux.db.tableNames();
        if (!tables.includes('visual_snapshots')) continue;
        const auxTable = await aux.db.openTable('visual_snapshots');
        let results = await auxTable.query().where(`id = '${safeIdOrName}'`).limit(1).toArray();
        if (results.length === 0) {
          results = await auxTable.query().where(`name = '${safeIdOrName}'`).limit(1).toArray();
        }
        if (results.length > 0) {
          return results[0] as unknown as VisualSnapshot;
        }
      } catch (err) {
        logger.debug(`Failed to query auxiliary snapshot:`, err);
      }
    }
    return null;
  }

  async listSnapshots(limit: number = 50): Promise<VisualSnapshot[]> {
    if (!this.snapshotsTable) throw new Error('Snapshots table not initialized.');
    const results = await this.snapshotsTable.query().limit(limit).toArray();
    return results as unknown as VisualSnapshot[];
  }

  async listSnapshotsAll(limit: number = 50): Promise<VisualSnapshot[]> {
    const combined: VisualSnapshot[] = [];
    const primary = await this.listSnapshots(limit);
    combined.push(...primary);

    for (const aux of this.auxiliaryDbs.values()) {
      try {
        const tables = await aux.db.tableNames();
        if (!tables.includes('visual_snapshots')) continue;
        const auxTable = await aux.db.openTable('visual_snapshots');
        const auxSnapshots = (await auxTable
          .query()
          .limit(limit)
          .toArray()) as unknown as VisualSnapshot[];
        combined.push(...auxSnapshots);
      } catch (err) {
        logger.debug(`Failed to query auxiliary snapshots:`, err);
      }
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    const deduplicated: VisualSnapshot[] = [];
    for (const s of combined) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        deduplicated.push(s);
      }
    }
    return deduplicated.slice(0, limit);
  }

  async deleteSnapshot(id: string): Promise<void> {
    if (!this.snapshotsTable) throw new Error('Snapshots table not initialized.');
    logger.debug(`Deleting snapshot: ${id}`);
    const safeId = escapeSql(id);
    await withRetry(async () => {
      await this.snapshotsTable!.delete(`id = '${safeId}'`);
    });
  }

  // --- Maintenance & Indexing ---

  async createVectorIndex(): Promise<void> {
    if (!this.statesTable) throw new Error('States table not initialized.');

    const count = (await this.statesTable.query().toArray()).length;
    if (count < 256) {
      logger.info(
        `Skipping vector index creation. Current row count (${count}) is too low (requires ~256+ rows for training).`
      );
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
    const now = Date.now();
    if (now < this.circuitTrippedUntil) {
      logger.debug('Compaction skipped: circuit breaker tripped.');
      return;
    }

    logger.info('Compacting LanceDB tables (running optimize with 30s timeout)...');
    try {
      const doOptimize = async () => {
        if (this.statesTable) await this.statesTable.optimize();
        if (this.transitionsTable) await this.transitionsTable.optimize();
        if (this.snapshotsTable) await this.snapshotsTable.optimize();
      };

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Compaction timed out after 30000ms')), 30000)
      );

      await Promise.race([doOptimize(), timeoutPromise]);
      this.compactionFailures = 0;
      logger.info('LanceDB optimization completed successfully.');
    } catch (err: any) {
      this.compactionFailures++;
      logger.error(`Failed to optimize database (failure ${this.compactionFailures}/3):`, err);
      if (this.compactionFailures >= 3) {
        this.circuitTrippedUntil = Date.now() + 15 * 60 * 1000;
        logger.warn(
          'Compaction circuit breaker TRIPPED for 15 minutes due to consecutive failures.'
        );
      }
    }
  }
}

export const storage = new StorageManager();
export function transitionKey(fromId: string, toId: string, action: string): string {
  return crypto
    .createHash('sha256')
    .update(`${fromId}:${toId}:${action}`)
    .digest('hex')
    .slice(0, 32);
}
