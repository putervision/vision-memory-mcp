export interface GroundedElement {
  id: string; // Element identifier or selector
  role: string; // "button" | "input" | "link" | "text" | "checkbox" | "combobox" | "heading" | "other"
  label: string; // Visible label or ARIA name
  selector: string; // CSS or XPath selector path
  bbox: [number, number, number, number]; // [x, y, width, height]
  center: [number, number]; // [center_x, center_y]
  state?: 'enabled' | 'disabled' | 'focused' | 'filled';
  value?: string; // Current value if input field
}

export interface GroundedActionTarget {
  action: string; // "click" | "type" | "navigate" | "scroll" | "custom"
  target_selector?: string;
  target_coords?: { x: number; y: number };
  element_label?: string;
  element_role?: string;
  suggested_input_value?: string;
}

export interface VisualState {
  id: string; // UUID v4
  dhash: string; // 64-bit binary string (dHash gradient)
  ahash: string; // 64-bit binary string (aHash average)
  vector: number[]; // CLIP ViT-B/32 embedding (512 dimensions)
  description: string; // Natural language description of state
  structured_data: string; // JSON string: extracted UI elements, form state, etc.
  accessibility_tree: string; // JSON string: simplified AX tree
  grounded_elements?: string; // JSON string: GroundedElement[]
  ocr_text?: string; // JSON string: extracted OCR text tokens & bounding boxes
  process_name?: string; // Application process identifier (e.g. "code", "chrome")
  window_title?: string; // OS window title
  monitor_id?: string; // Monitor/display identifier
  is_redacted?: number; // 1 = redacted, 0 = unredacted
  thumbnail: string; // Base64 WebP, 64x64px
  original_dimensions: string; // JSON string: { width: number, height: number }
  source_url: string; // URL or app path/identifier
  source_agent: string; // Agent identifier
  trace_id: string; // Tracing identifier
  git_branch: string; // Active git branch when captured
  tags: string; // JSON array string: string[]
  importance_score: number; // 0.0 - 1.0
  created_at: number; // Epoch ms
  last_accessed: number; // Epoch ms
  access_count: number; // Number of times accessed
  ttl: number; // Time-To-Live in ms (0 = never expire)
}

export interface StateTransition {
  id: string; // Deterministic SHA-256 hash of from_state_id:to_state_id:action
  from_state_id: string; // FK -> VisualState.id
  to_state_id: string; // FK -> VisualState.id
  action: string; // Description of action (e.g. "click 'login'")
  action_type: string; // "click" | "type" | "navigate" | "scroll" | "custom"
  success: number; // 1 = success, 0 = failure
  success_count: number; // Total successes
  failure_count: number; // Total failures
  duration_ms: number; // Average duration of action in ms
  last_traversed: number; // Epoch ms
  git_branch: string; // Git branch active during transition
  metadata: string; // JSON string: additional transition details/errors
}

export interface VisualSnapshot {
  id: string; // UUID v4
  name: string; // Checkpoint name
  description: string; // Purpose/context notes
  git_branch: string; // Active git branch when snapshot was taken
  created_at: number; // Epoch ms
  state_ids: string; // JSON array string of VisualState.id representing snapshot scope
}

export type RetrievalStrategy = 'fast' | 'semantic' | 'thorough';

export interface RetrievalResult {
  state_id: string;
  is_known: boolean;
  match_type: 'exact_hash' | 'near_hash' | 'vector_similar' | 'new';
  similarity_score: number;
  description: string;
  structured_data?: string;
  accessibility_tree?: string;
  grounded_elements?: GroundedElement[];
  ocr_text?: string;
  tags?: string[];
  source_url?: string;
  related_states?: Array<{
    id: string;
    description: string;
    similarity: number;
  }>;
}

export interface NavigationStep {
  state_id: string;
  description: string;
  action: string;
  success_rate: number;
}

export interface NavigationPath {
  steps: NavigationStep[];
  total_success_rate: number;
  avg_duration_ms: number;
}

export type ResponseFormat = 'compact' | 'full';

export interface CompactRetrievalResult {
  state_id: string;
  is_known: boolean;
  match_type: string;
  similarity_score: number;
  description: string;
  source_url?: string;
  tags?: string[];
}

export interface MetricsStats {
  total_queries: number;
  l1_exact_hits: number;
  l2_near_hits: number;
  l3_vector_hits: number;
  l4_llm_calls: number;
  cache_misses: number;
  cache_hit_ratio: number;
  estimated_tokens_saved: number;
  avg_similarity_score: number;
  uptime_seconds: number;
}

export interface EvictionPolicyConfig {
  maxSizeMb: number;
  watermarkRatio: number;
  strategy: 'lru' | 'importance' | 'hybrid';
}

export interface SnapshotArchive {
  version: string;
  exported_at: number;
  name: string;
  description: string;
  git_branch: string;
  states: VisualState[];
  transitions: StateTransition[];
  snapshot: VisualSnapshot;
}

export interface BenchmarkResults {
  timestamp: string;
  concurrency_level: number;
  l1_latency_ms: { p50: number; p95: number; p99: number };
  l2_latency_ms: { p50: number; p95: number; p99: number };
  l3_latency_ms: { p50: number; p95: number; p99: number };
  ops_per_second: number;
}

