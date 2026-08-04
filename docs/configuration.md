# ⚙️ Configuration Guide — vision-memory-mcp

`@putervision/vision-memory-mcp` is configured via environment variables set in your project's `.env` file or environment shell.

---

## 🛠️ Environment Variables Reference

```bash
LANCEDB_PATH=.vision-memory-mcp        # Storage path for LanceDB database files
LANCEDB_CACHE_SIZE=100                  # Maximum hot items in LRU Cache
MAX_LANCEDB_SIZE_MB=1000                # Storage size eviction threshold (MB)
STRICT_MODE=false                       # Refuse external L4 calls & enforce projectRoot paths
STRIP_EXIF=true                         # Strip EXIF metadata from stored screenshots
OFFLINE_MODE=false                      # Restrict CLIP loading to local files only
CLIP_MODEL_PATH=                        # Optional local path to pre-downloaded CLIP model
LIMIT_INPUT_PIXELS=16777216             # Sharp decompression bomb pixel limit
HASH_EXACT_THRESHOLD=5                  # Hamming distance <= this = exact hit
HASH_SIMILAR_THRESHOLD=10               # Hamming distance <= this = similar hit
CLIP_MODEL=Xenova/clip-vit-base-patch32 # Embedding model name
EMBEDDING_DIMENSIONS=512                # CLIP embedding output dimension
VISION_MODEL_ENABLED=false              # Enable L4 vision fallback
VISION_MODEL_ENDPOINT=http://localhost:1234/v1 # Vision model server URL
VISION_MODEL_NAME=gpt-4o               # Vision model identifier
OPENAI_API_KEY=your-api-key-here        # Required if using OpenAI endpoints for L4 fallback
LOG_LEVEL=info                          # Log levels (debug, info, warn, error)
TTL_DEFAULT_MS=604800000                # Eviction TTL (default: 7 days)
```

---

## 🔑 Key Configuration Settings

### Storage & Eviction
- **`LANCEDB_PATH`**: Relative or absolute path where LanceDB tables (`visual_states`, `state_transitions`, `visual_snapshots`) are stored. Default: `.vision-memory-mcp`.
- **`MAX_LANCEDB_SIZE_MB`**: Maximum disk space allocated to the LanceDB database. Least recently accessed states are evicted when threshold is exceeded.
- **`TTL_DEFAULT_MS`**: Time-to-live for cached visual states in milliseconds. Default: 7 days (`604800000`).

### Perceptual Hashing & Matching
- **`HASH_EXACT_THRESHOLD`**: Maximum Hamming distance between dHash strings to qualify as an `exact_hash` match. Default: `5`.
- **`HASH_SIMILAR_THRESHOLD`**: Maximum Hamming distance to qualify as a `near_hash` match. Default: `10`.

### L4 Vision Model Fallback
- **`VISION_MODEL_ENABLED`**: Set to `true` to enable L4 vision model fallback when L1–L3 cache misses occur.
- **`VISION_MODEL_ENDPOINT`**: HTTP/HTTPS base URL of your vision LLM provider (OpenAI API, Ollama, LM Studio, vLLM).
- **`VISION_MODEL_NAME`**: Model identifier string (e.g., `gpt-4o`, `llava`, `qwen2-vl`).
