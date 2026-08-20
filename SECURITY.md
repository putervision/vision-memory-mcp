# Security Policy

`vision-memory-mcp` handles local workspace visual state caching, perceptual hashing, and LanceDB database storage. We take security seriously.

---

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| v1.0.x  | :white_check_mark: |
| v0.9.x  | :white_check_mark: |
| v0.8.x  | :white_check_mark: |
| v0.7.x  | :white_check_mark: |
| v0.6.x  | :white_check_mark: |
| v0.5.x  | :white_check_mark: |
| v0.4.x  | :white_check_mark: |
| < 0.4.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability in `vision-memory-mcp` (e.g., path traversal, unsafe local file reading, or database file permissions exposure), please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Send an email to **security@putervision.com** or report via GitHub Security Advisory.
3. Include detailed steps to reproduce, impact analysis, and proof-of-concept if available.

### Our Commitment
- We will acknowledge receipt of your vulnerability report within **48 hours**.
- We will coordinate a security patch release before public disclosure.

---

## Sensitive Data, Privacy & Liability Disclaimers

### 1. Sensitive Information & Credential Responsibility
`vision-memory-mcp` captures and caches visual state screenshots locally in `.vision-memory-mcp/`. Users and organization administrators are solely responsible for ensuring that captured screenshots do not contain confidential information, credentials, API keys, passwords, Personally Identifiable Information (PII), or regulated data (such as HIPAA or PCI-DSS protected information). PuterVision and the software authors assume no liability for sensitive data stored or exposed within local visual cache directories.

### 2. Filesystem Security & Encryption
By default, visual cache data is stored unencrypted at the application layer on the local filesystem. For sensitive development environments, users are strongly advised to enable OS-level filesystem encryption (such as Linux `fscrypt`/LUKS, macOS APFS Encrypted Sparse Images, or Windows BitLocker) as documented in `docs/STORAGE_ENCRYPTION.md`.

### 3. Third-Party API Costs & Financial Liability
If Optional L4 LLM Vision Fallback is enabled (`VISION_MODEL_ENABLED=true`), external API requests may be transmitted to third-party providers (e.g. OpenAI, Anthropic, OpenRouter). PuterVision and the software authors are not responsible for any API usage fees, billing overages, rate limits, or financial liabilities resulting from execution or automated agent loops.
