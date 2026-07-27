# 🔒 Storage Encryption-at-Rest Guide for `vision-memory-mcp`

`vision-memory-mcp` stores vector embeddings, perceptual hash indexes, and UI state metadata inside a local directory (default: `.vision-memory-mcp/` or configured via `LANCEDB_PATH`).

Because LanceDB utilizes high-performance Apache Arrow columnar binary files, the most effective, zero-overhead way to protect visual state databases at rest is using OS-level transparent filesystem encryption.

---

## 1. Linux Filesystem Encryption

### Option A: Per-Directory Encryption with `fscrypt` (Recommended for ext4/f2fs)

`fscrypt` provides native, kernel-level directory encryption for Linux ext4 or f2fs file systems.

```bash
# 1. Install fscrypt
sudo apt-get install fscrypt pam-fscrypt

# 2. Setup fscrypt on your filesystem mount
sudo fscrypt setup /

# 3. Encrypt the visual memory directory
mkdir -p .vision-memory-mcp
fscrypt encrypt .vision-memory-mcp --user=$USER
```

### Option B: Encrypted Volume with LUKS

For full partition encryption:
```bash
# Create encrypted volume
sudo cryptsetup luksFormat /dev/sdX1
sudo cryptsetup open /dev/sdX1 vision_memory_sec
sudo mkfs.ext4 /dev/mapper/vision_memory_sec

# Mount volume to project path
sudo mount /dev/mapper/vision_memory_sec ./vision-memory-mcp
```

---

## 2. macOS Encrypted Sparse Image / Volume

On macOS, you can isolate the `.vision-memory-mcp` directory inside a password-protected, encrypted APFS sparse image that mounts on demand:

```bash
# 1. Create a 5GB encrypted APFS sparse image
hdiutil create -size 5g -type SPARSE -fs APFS -volname VisionMemoryEncrypted -encryption AES-256 vision-memory.sparseimage

# 2. Mount the volume
hdiutil attach vision-memory.sparseimage

# 3. Set LANCEDB_PATH in your environment
export LANCEDB_PATH="/Volumes/VisionMemoryEncrypted/.vision-memory-mcp"
```

---

## 3. Windows BitLocker / EFS

- **Encrypted File System (EFS)**: Right-click the `.vision-memory-mcp` folder -> Properties -> Advanced -> Check **Encrypt contents to secure data**.
- **BitLocker Drive Encryption**: Enable BitLocker on the drive storing your workspaces.

---

## 4. Operational Best Practices

1. **Environment Isolation**: Set `STRICT_MODE=true` in `.env` to ensure `file_path` image reads are locked inside the workspace root.
2. **Key Rotation**: When rotating encryption keys, unmount the volume, re-encrypt with the new passphrase, and re-mount.
3. **Backup Safeguards**: Always run `export_snapshot` to export an encrypted snapshot archive before unmounting or performing filesystem upgrades.
