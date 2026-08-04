import readline from 'readline';
import { setVisualSpec, exportVisualSpecSuite, VisualSpecInfo } from './visual-spec.js';
import { logger } from '../logger.js';

export interface InteractiveCaptureOptions {
  targetUrl?: string;
  outputPath?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  onCaptureSuccess?: (info: { name: string; id: string; dhash: string }) => void;
}

/**
 * Runs an interactive baseline visual spec capture session.
 * Connects to a test browser or accepts view names interactively, taking screenshots
 * whenever the user signals readiness.
 */
export async function runInteractiveBaselineCapture(
  options: InteractiveCaptureOptions = {}
): Promise<{ captured_count: number; specs: VisualSpecInfo[]; manifest_path: string }> {
  const targetUrl = options.targetUrl || 'http://localhost:3000';
  let playwrightBrowser: any = null;
  let playwrightPage: any = null;

  console.log('\n============================================================');
  console.log('  📸 Vision Memory MCP — Interactive Baseline Capture Mode');
  console.log('============================================================');

  // Attempt to launch Playwright headful browser if installed
  try {
    // @ts-expect-error Optional peer dependency
    const pw = await import('playwright');
    logger.info(`Launching Playwright headful Chromium browser at ${targetUrl}...`);
    playwrightBrowser = await pw.chromium.launch({ headless: false });
    const context = await playwrightBrowser.newContext();
    playwrightPage = await context.newPage();
    await playwrightPage.goto(targetUrl).catch((err: any) => {
      logger.warn(`Could not load target URL ${targetUrl} immediately: ${err.message}`);
    });
    console.log(`\nBrowser opened at: ${targetUrl}`);
  } catch {
    console.log(
      `\nPlaywright not detected or headless mode active. Using interactive terminal mode.`
    );
    console.log(`Target URL / Dev Server: ${targetUrl}`);
  }

  console.log('\nStep through your application views manually in your test browser.');
  console.log('Whenever you reach a view you want to baseline:');
  console.log(
    '  👉 Type the view name (e.g. "Login Page", "Dashboard", "Checkout Drawer") and press Enter.'
  );
  console.log('  👉 Type "list" to view captured baselines so far.');
  console.log('  👉 Type "done" or "exit" to complete the session.\n');
  console.log('------------------------------------------------------------\n');

  const capturedSpecs: Array<{ name: string; id: string; dhash: string }> = [];

  const rl = readline.createInterface({
    input: options.input || process.stdin,
    output: options.output || process.stdout,
  });

  let isClosed = false;
  rl.on('close', () => {
    isClosed = true;
  });

  const promptUser = (): Promise<string> => {
    return new Promise((resolve) => {
      if (isClosed) return resolve('exit');
      try {
        rl.question(`[Specs Captured: ${capturedSpecs.length}] Enter view name > `, (answer) => {
          resolve((answer || '').trim());
        });
      } catch {
        resolve('exit');
      }
    });
  };

  try {
    while (true) {
      const input = await promptUser();

      if (!input) continue;
      const lower = input.toLowerCase();

      if (lower === 'done' || lower === 'exit' || lower === 'quit') {
        console.log('\nConcluding baseline capture session...');
        break;
      }

      if (lower === 'list') {
        console.log('\nCaptured Specs in this session:');
        if (capturedSpecs.length === 0) {
          console.log('  (None yet captured)');
        } else {
          capturedSpecs.forEach((s, idx) => {
            console.log(`  ${idx + 1}. "${s.name}" (ID: ${s.id})`);
          });
        }
        console.log('');
        continue;
      }

      if (lower === 'help') {
        console.log('\nCommands:');
        console.log('  <view-name>  : Capture screenshot and store as visual spec baseline');
        console.log('  list         : Show captured specs in this session');
        console.log('  done / exit  : Finish session and export manifest\n');
        continue;
      }

      // Capture active page screenshot
      let base64Image: string | undefined;
      let currentUrl = targetUrl;

      if (playwrightPage) {
        try {
          const buf = await playwrightPage.screenshot({ type: 'png', fullPage: false });
          base64Image = buf.toString('base64');
          currentUrl = playwrightPage.url() || targetUrl;
        } catch (err: any) {
          console.error(`❌ Failed to capture Playwright page screenshot: ${err.message}`);
        }
      }

      if (!base64Image) {
        console.log(
          `⚠️  No live browser screenshot available. Please paste image file path for "${input}":`
        );
        const imgPath = await new Promise<string>((res) =>
          rl.question('Image File Path > ', (ans) => res(ans.trim()))
        );
        if (!imgPath) {
          console.log('Skipped capture.');
          continue;
        }
        try {
          const fs = await import('fs');
          base64Image = fs.readFileSync(imgPath).toString('base64');
        } catch (err: any) {
          console.error(`❌ Failed to read image file: ${err.message}`);
          continue;
        }
      }

      // Register Visual Spec
      try {
        const spec = await setVisualSpec({
          name: input,
          screenshot: base64Image,
          metadata: {
            source_url: currentUrl,
            captured_interactively: true,
          },
        });

        capturedSpecs.push(spec);
        if (options.onCaptureSuccess) {
          options.onCaptureSuccess(spec);
        }
        console.log(`\n✓ Baseline Visual Spec "${spec.name}" registered! (ID: ${spec.id})\n`);
      } catch (err: any) {
        console.error(`❌ Failed to register visual spec "${input}": ${err.message}\n`);
      }
    }
  } finally {
    rl.close();
    if (playwrightBrowser) {
      try {
        await playwrightBrowser.close();
      } catch {}
    }
  }

  // Export suite manifest
  const suiteResult = await exportVisualSpecSuite(options.outputPath);

  console.log('\n============================================================');
  console.log(`  🎉 Session Finished: ${suiteResult.spec_count} Visual Specs Registered`);
  console.log(`  📄 Suite Manifest: ${suiteResult.manifest_path}`);
  console.log('============================================================\n');

  return {
    captured_count: capturedSpecs.length,
    specs: suiteResult.specs,
    manifest_path: suiteResult.manifest_path,
  };
}
