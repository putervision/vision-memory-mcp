import { setVisualSpec, verifyVisualSpec, listVisualSpecs, exportVisualSpecSuite } from '../../core/visual-spec.js';
import { runInteractiveBaselineCapture } from '../../core/baseline-capturer.js';
import { storage } from '../../core/storage.js';

export async function runSpec(args: string[]) {
  const subCommand = args[1];

  if (!subCommand || subCommand === '--help' || subCommand === '-h') {
    console.log(`
Usage: vision-memory-mcp spec <subcommand> [options]

Subcommands:
  capture [url]                        Launch interactive browser baseline capture session
  set <name> <image-path>              Register an image as a visual spec baseline
  verify <spec-name> <image-path>      Verify a live screenshot against baseline spec
  list                                 List all registered visual spec baselines in the project
  export [output-path]                 Export all visual spec baselines to a JSON suite manifest
`);
    return;
  }

  await storage.init();

  if (subCommand === 'capture') {
    const targetUrl = args[2] && !args[2].startsWith('-') ? args[2] : undefined;
    await runInteractiveBaselineCapture({ targetUrl });
  } else if (subCommand === 'set') {
    const name = args[2];
    const filePath = args[3];
    if (!name || !filePath) {
      console.error('Error: Both spec name and image file path are required.');
      process.exit(1);
    }
    const res = await setVisualSpec({ name, filePath });
    console.log(`✓ Visual Spec "${res.name}" registered successfully. ID: ${res.id}`);
  } else if (subCommand === 'verify') {
    const specName = args[2];
    const filePath = args[3];
    if (!specName || !filePath) {
      console.error('Error: Both spec name and image file path are required.');
      process.exit(1);
    }
    const tolIdx = args.indexOf('--tolerance');
    const tolerance = tolIdx !== -1 ? parseInt(args[tolIdx + 1], 10) : 8;

    const res = await verifyVisualSpec({ specName, filePath, tolerance });
    console.log(JSON.stringify(res, null, 2));

    if (!res.is_compliant) {
      process.exit(1);
    }
  } else if (subCommand === 'list') {
    const specs = await listVisualSpecs();
    console.log(`\n============================================================`);
    console.log(`  📋 Registered Visual Spec Baselines (${specs.length} Total)`);
    console.log(`============================================================`);
    if (specs.length === 0) {
      console.log('  No visual spec baselines registered yet.');
    } else {
      specs.forEach((s, i) => {
        console.log(`  ${i + 1}. "${s.name}" (ID: ${s.id}) - dHash: ${s.dhash.slice(0, 16)}...`);
      });
    }
    console.log('');
  } else if (subCommand === 'export') {
    const outPath = args[2] && !args[2].startsWith('-') ? args[2] : undefined;
    const res = await exportVisualSpecSuite(outPath);
    console.log(`✓ Exported ${res.spec_count} visual spec baselines to: ${res.manifest_path}`);
  } else {
    console.error(`Unknown spec subcommand: ${subCommand}`);
    process.exit(1);
  }
}
