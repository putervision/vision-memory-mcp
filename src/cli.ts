#!/usr/bin/env node

declare const __APP_VERSION__: string;
const pkgVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.8.0';

function showHelp() {
  console.log(`
vision-memory-mcp CLI Tool v${pkgVersion}

Usage:
  vision-memory-mcp <command> [options]

Commands:
  run                Start the MCP server on stdio transport (Default)
  init [-y|--yes]    Scaffold the workspace, .gitignore, .env, and Cursor rules
  init-global        Re-initialize across all projects registered in ~/.vision-memory-mcp/projects.json
  doctor             Run environment health checks (LanceDB, sharp, git, Node)
  doctor-global      Run health checks & output metrics across all registered projects in ~/.vision-memory-mcp/projects.json
  update             Check npm registry and update @putervision/vision-memory-mcp globally
  audit              Audit sub-directory Git repos and multi-database memory status
  inspect            Display an ASCII table of stored visual states and tags
  metrics            Calculate and output cache hit rate, token savings, and ROI
  view               Launch the interactive HTML force-directed graph visualizer
  spec <action>      Manage visual design spec contract baselines & verification:
                       spec set <name> <image-path>
                       spec verify <spec-name> <image-path> [--tolerance <n>]
  video <action>     Manage WebM & MP4 video frame digesting memory:
                       video ingest <filepath> [--fps <n>] [--category <cat>]
                       video inspect <video_id>
                       video list

  snapshot <action>  Manage checkpoints:
                       snapshot save <name> [desc]
                       snapshot diff <nameA> <nameB>
                       snapshot list
  undo               Revert the last visual state addition or transition
  optimize           Run LanceDB table compaction and reindex
  prune              Purge expired or low-access states
  backup             Backup LanceDB visual memory folder
  restore <file>     Restore LanceDB visual memory folder from backup
  export             Export visual memory graph (formats: json, mermaid, html)
  import <file>      Import visual memory graph from a JSON file
  query <img-path>   Query visual cache for a local screenshot file
  ingest <img-path> <desc> Ingest a local screenshot with a provided layout description

Options:
  --limit <n>        Limit results for inspect (default: 20)
  --format <fmt>     Export format: json, mermaid, html (default: json)
  --out <file>       Output file path for export
  -v, --version      Show version number
  -h, --help         Show this help menu
`);
}

async function runCli() {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (
    args.includes('--version') ||
    args.includes('-v') ||
    command === 'version'
  ) {
    console.log(pkgVersion);
    process.exit(0);
  }

  switch (command) {
    case 'run':
      await import('./index.js');
      break;

    case 'init': {
      const { runInit } = await import('./cli/init.js');
      await runInit(args);
      break;
    }

    case 'init-global': {
      const { runInitGlobal } = await import('./cli/init.js');
      await runInitGlobal(args);
      break;
    }

    case 'inspect': {
      const { runInspect } = await import('./cli/commands/inspect.js');
      await runInspect(args);
      break;
    }

    case 'metrics': {
      const { runMetrics } = await import('./cli/commands/metrics.js');
      await runMetrics();
      break;
    }

    case 'view': {
      const { runView } = await import('./cli/commands/view.js');
      await runView(args);
      break;
    }

    case 'snapshot': {
      const { runSnapshot } = await import('./cli/commands/snapshot.js');
      await runSnapshot(args);
      break;
    }

    case 'undo': {
      const { runUndo } = await import('./cli/commands/snapshot.js');
      await runUndo(args);
      break;
    }

    case 'optimize': {
      const { runOptimize } = await import('./cli/commands/actions.js');
      await runOptimize();
      break;
    }

    case 'prune': {
      const { runPrune } = await import('./cli/commands/actions.js');
      await runPrune(args);
      break;
    }

    case 'backup': {
      const { runBackup } = await import('./cli/commands/actions.js');
      await runBackup(args);
      break;
    }

    case 'restore': {
      const { runRestore } = await import('./cli/commands/actions.js');
      await runRestore(args);
      break;
    }

    case 'export': {
      const { runExport } = await import('./cli/commands/actions.js');
      await runExport(args);
      break;
    }

    case 'import': {
      const { runImport } = await import('./cli/commands/actions.js');
      await runImport(args);
      break;
    }

    case 'query': {
      const { runQuery } = await import('./cli/commands/ingest-query.js');
      await runQuery(args);
      break;
    }

    case 'ingest': {
      const { runIngest } = await import('./cli/commands/ingest-query.js');
      await runIngest(args);
      break;
    }

    case 'doctor':
    case 'health-check': {
      const { runDoctor } = await import('./cli/commands/doctor.js');
      await runDoctor(args);
      break;
    }

    case 'doctor-global': {
      const { runDoctorGlobal } = await import('./cli/commands/doctor.js');
      await runDoctorGlobal(args);
      break;
    }

    case 'update':
    case 'upgrade': {
      const { runUpdate } = await import('./cli/commands/update.js');
      await runUpdate(pkgVersion);
      break;
    }

    case 'audit': {
      const { runAudit } = await import('./cli/commands/audit.js');
      await runAudit(args);
      break;
    }

    case 'spec': {
      const { runSpec } = await import('./cli/commands/spec.js');
      await runSpec(args);
      break;
    }

    case 'video': {
      const { storage } = await import('./core/storage.js');
      await storage.init();
      const subAction = args[1] || 'list';
      const subArgs = args.slice(2);
      if (subAction === 'ingest') {
        const { runVideoIngestCommand } = await import('./cli/video-commands.js');
        await runVideoIngestCommand(subArgs);
      } else if (subAction === 'inspect') {
        const { runVideoInspectCommand } = await import('./cli/video-commands.js');
        await runVideoInspectCommand(subArgs);
      } else if (subAction === 'list') {
        const { runVideoListCommand } = await import('./cli/video-commands.js');
        await runVideoListCommand();
      } else {
        console.error(`Unknown video sub-command: ${subAction}. Options: ingest, inspect, list`);
        process.exit(1);
      }
      break;
    }

    default:

      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

runCli().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
