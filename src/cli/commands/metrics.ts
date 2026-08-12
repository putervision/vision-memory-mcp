import fs from 'fs';
import path from 'path';
import { storage } from '../../core/storage.js';
import { config } from '../../config.js';
import { getCachedDirSize } from '../../utils/fs.js';

export async function runMetrics() {
  await storage.init();
  const states = await storage.listStates(undefined, 10000);
  const transitions = await storage.listTransitions(undefined, 10000);

  let totalHits = 0;
  for (const s of states) {
    if (s.access_count > 1) {
      totalHits += s.access_count - 1;
    }
  }

  const totalStates = states.length;
  const totalLookups = totalHits + totalStates;
  const hitRate = totalLookups > 0 ? (totalHits / totalLookups) * 100 : 0;

  const tokensSaved = totalHits * 1600;
  const dollarsSaved = (tokensSaved / 1000000) * 3.0;
  const timeSavedHours = (totalHits * 4.0) / 3600;

  // Find db directory size
  let dbSizeMb = 0;
  try {
    const stats = fs.statSync(config.LANCEDB_PATH);
    if (stats.isDirectory()) {
      dbSizeMb = getCachedDirSize(config.LANCEDB_PATH) / 1024 / 1024;
    }
  } catch (err) {}

  console.log(`
# 📊 Visual Memory Value & ROI Metrics

Estimated value added by caching visual states:

### 🚀 Productivity ROI Estimates
* **Estimated Time Saved**: **${timeSavedHours.toFixed(1)} hours** (~${Math.round(timeSavedHours * 60)} minutes saved)
  * Avoided LLM vision latency: **${totalHits} lookups** resolved instantly via cache.
* **Estimated Token Savings**: **${tokensSaved.toLocaleString()} tokens**
  * Cached screens: **${totalStates} unique states** stored, avoiding repetitive ingestion.
* **Estimated Financial Savings**: **$${dollarsSaved.toFixed(2)}** (based on $3.00/M input token baseline)
* **Design Target Latency**: **~4.7ms** (L1/L2 fast-path lookup) vs. **~3,800ms** (L4 LLM fallback)

### 📈 Cache Health & Structure
* **Total Stored States**: **${totalStates} visual states**
* **Total Recorded Transitions**: **${transitions.length} edges** (navigation pathways)
* **Cache Hit Rate**: **${hitRate.toFixed(1)}%** (${totalHits} hits / ${totalLookups} lookups)
* **Database File Size**: **${dbSizeMb.toFixed(1)} MB** (includes vector index + compressed thumbnails)
`);
}
