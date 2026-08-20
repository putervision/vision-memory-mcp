import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';

export const DEFAULT_REGISTRY_PATH = path.join(os.homedir(), '.vision-memory-mcp', 'projects.json');
export const LEGACY_REGISTRY_PATH = path.join(os.homedir(), '.vision-memory-mcp-registry.json');

export function getRegistryPath(): string {
  return process.env.VISION_MEMORY_REGISTRY_PATH || DEFAULT_REGISTRY_PATH;
}

export const REGISTRY_PATH = DEFAULT_REGISTRY_PATH;
const REGISTRY_TTL_MS = 5000;

interface CacheEntry {
  registry: Record<string, string>;
  timestamp: number;
}

let registryCache: CacheEntry | null = null;

function cleanupTempRegistryFiles(): void {
  try {
    const regPath = getRegistryPath();
    const home = path.dirname(regPath);
    if (!fs.existsSync(home)) return;
    const files = fs.readdirSync(home);
    for (const f of files) {
      if (f.startsWith('projects.json.tmp.')) {
        try {
          fs.unlinkSync(path.join(home, f));
        } catch {}
      }
    }
  } catch {}
}

export function getRegistry(): Record<string, string> {
  cleanupTempRegistryFiles();
  const now = Date.now();
  if (registryCache && now - registryCache.timestamp < REGISTRY_TTL_MS) {
    return registryCache.registry;
  }

  const regPath = getRegistryPath();
  try {
    const targetPath = fs.existsSync(regPath)
      ? regPath
      : !process.env.VISION_MEMORY_REGISTRY_PATH && fs.existsSync(LEGACY_REGISTRY_PATH)
        ? LEGACY_REGISTRY_PATH
        : null;

    if (targetPath) {
      const raw = fs.readFileSync(targetPath, 'utf-8');
      try {
        const registry = JSON.parse(raw) || {};
        registryCache = { registry, timestamp: now };

        // Auto-restore / migrate if needed
        if (targetPath === LEGACY_REGISTRY_PATH && !fs.existsSync(regPath)) {
          try {
            const dir = path.dirname(regPath);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(regPath, JSON.stringify(registry, null, 2), {
              encoding: 'utf-8',
              mode: 0o600,
            });
            logger.info(`Migrated legacy project registry to: ${regPath}`);
          } catch {}
        }

        return registry;
      } catch (parseErr) {
        logger.error('Corrupt registry file detected at:', targetPath, parseErr);
      }
    }
  } catch (e) {
    logger.warn('Failed to read global vision-memory-mcp registry:', e);
  }
  return {};
}

export function registerProject(name: string, projectPath: string): void {
  try {
    const resolvedPath = path.resolve(projectPath);
    if (resolvedPath === os.homedir()) return;

    registryCache = null;
    const registry = getRegistry();
    registry[name.toLowerCase()] = resolvedPath;
    const regPath = getRegistryPath();
    const dir = path.dirname(regPath);
    fs.mkdirSync(dir, { recursive: true });

    const tempPath = `${regPath}.tmp.${Math.random().toString(36).substring(2)}`;
    fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    try {
      fs.renameSync(tempPath, regPath);
    } catch {
      fs.copyFileSync(tempPath, regPath);
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }

    // Persist backup if working with primary default registry
    if (!process.env.VISION_MEMORY_REGISTRY_PATH) {
      try {
        fs.writeFileSync(LEGACY_REGISTRY_PATH, JSON.stringify(registry, null, 2), {
          encoding: 'utf-8',
          mode: 0o600,
        });
      } catch {}
    }
  } catch (e) {
    logger.error('Failed to register project in global vision-memory-mcp registry:', e);
  }
}

export function unregisterProject(name: string): void {
  try {
    registryCache = null;
    const registry = getRegistry();
    delete registry[name.toLowerCase()];
    const regPath = getRegistryPath();
    const tempPath = `${regPath}.tmp.${Math.random().toString(36).substring(2)}`;
    fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    try {
      fs.renameSync(tempPath, regPath);
    } catch {
      fs.copyFileSync(tempPath, regPath);
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }

    // Persist backup if working with primary default registry
    if (!process.env.VISION_MEMORY_REGISTRY_PATH) {
      try {
        fs.writeFileSync(LEGACY_REGISTRY_PATH, JSON.stringify(registry, null, 2), {
          encoding: 'utf-8',
          mode: 0o600,
        });
      } catch {}
    }
  } catch (e) {
    logger.error('Failed to unregister project from global vision-memory-mcp registry:', e);
  }
}

export function getProjectFromRegistry(name: string): string | undefined {
  const registry = getRegistry();
  return registry[name.toLowerCase()];
}
