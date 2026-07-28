import { setVisualSpec, verifyVisualSpec } from '../../core/visual-spec.js';
import { storage } from '../../core/storage.js';

export async function runSpec(args: string[]) {
  const subCommand = args[1];

  if (!subCommand || subCommand === '--help' || subCommand === '-h') {
    console.log(`
Usage: vision-memory-mcp spec <subcommand> [options]

Subcommands:
  set <name> <image-path>              Register an image as a visual spec baseline
  verify <spec-name> <image-path>      Verify a live screenshot against baseline spec
`);
    return;
  }

  await storage.init();

  if (subCommand === 'set') {
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
  } else {
    console.error(`Unknown spec subcommand: ${subCommand}`);
    process.exit(1);
  }
}
