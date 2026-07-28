import { hammingDistance } from './hash.js';

export interface SequenceFrame {
  dhash: string;
  timestamp: number;
  is_transient?: boolean;
}

export interface SequenceMatchResult {
  is_sequence_matched: boolean;
  target_end_state_id?: string;
  matched_frames: number;
}

/**
 * Tracks short temporal sequences of dHashes to identify transient loading animation states.
 */
export class SequenceTracker {
  private historyWindow: SequenceFrame[] = [];
  private maxWindowSize: number;

  constructor(maxWindowSize = 5) {
    this.maxWindowSize = maxWindowSize;
  }

  addFrame(dhash: string, is_transient = false): SequenceFrame[] {
    this.historyWindow.push({ dhash, timestamp: Date.now(), is_transient });
    if (this.historyWindow.length > this.maxWindowSize) {
      this.historyWindow.shift();
    }
    return this.historyWindow;
  }

  detectTransientSequence(thresholdDistance = 8): boolean {
    if (this.historyWindow.length < 2) return false;
    let totalDelta = 0;
    for (let i = 1; i < this.historyWindow.length; i++) {
      totalDelta += hammingDistance(this.historyWindow[i - 1].dhash, this.historyWindow[i].dhash);
    }
    const avgDelta = totalDelta / (this.historyWindow.length - 1);
    // Transient animation frames shift slightly per step (small gradient delta)
    return avgDelta > 0 && avgDelta <= thresholdDistance;
  }

  clear(): void {
    this.historyWindow = [];
  }
}
