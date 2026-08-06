import path from 'path';
import { handleIngestVideo, handleGetVideoTimeline } from '../tools/handlers.js';
import { storage } from '../core/storage.js';
import { logger } from '../logger.js';

export async function runVideoIngestCommand(args: string[]): Promise<void> {
  const filePath = args[0];
  if (!filePath) {
    console.error(
      'Error: Video file path is required. Usage: vision-memory-mcp video ingest <filepath>'
    );
    process.exit(1);
  }

  const categoryIndex = args.indexOf('--category');
  const category =
    categoryIndex !== -1 && args[categoryIndex + 1] ? args[categoryIndex + 1] : 'general';

  const fpsIndex = args.indexOf('--fps');
  const fps = fpsIndex !== -1 && args[fpsIndex + 1] ? parseFloat(args[fpsIndex + 1]) : 1.0;

  console.log(
    `Ingesting video file: ${path.resolve(filePath)} (fps=${fps}, category=${category})...`
  );

  try {
    const result = await handleIngestVideo({
      file_path: path.resolve(filePath),
      fps,
      category,
    });

    console.log('\n✅ Video Memory Ingestion Complete!');
    console.log(`Video ID:               ${result.video_id}`);
    console.log(`Format:                 ${result.file_format}`);
    console.log(`Duration:               ${(result.duration_ms / 1000).toFixed(2)}s`);
    console.log(`Frames Extracted:       ${result.extracted_frames_count}`);
    console.log(`Unique Visual States:   ${result.unique_states_count}`);
    console.log(`Category:               ${result.category}`);
    console.log(`Summary:                ${result.summary}\n`);
  } catch (err: any) {
    console.error(`❌ Error ingesting video: ${err.message}`);
    process.exit(1);
  }
}

export async function runVideoInspectCommand(args: string[]): Promise<void> {
  const videoId = args[0];
  if (!videoId) {
    console.error('Error: Video ID is required. Usage: vision-memory-mcp video inspect <video_id>');
    process.exit(1);
  }

  try {
    const timeline = await handleGetVideoTimeline({ video_id: videoId });
    const rec = timeline.video;

    console.log(`\n📹 Video Memory Record [${rec.id}]`);
    console.log(`Source File:       ${rec.source_file}`);
    console.log(`Format:            ${rec.file_format}`);
    console.log(`Duration:          ${(rec.duration_ms / 1000).toFixed(2)}s`);
    console.log(`Category:          ${rec.category}`);
    console.log(`Created At:        ${new Date(rec.created_at).toISOString()}`);
    console.log(`Summary:           ${rec.summary_description}\n`);

    console.log('Frame Keyframe Timeline:');
    console.log('----------------------------------------------------------------------');
    console.log('Frame Index | Timestamp (ms) | Keyframe | State ID');
    console.log('----------------------------------------------------------------------');
    for (const item of timeline.timeline) {
      const idxStr = String(item.frame_index).padEnd(11);
      const tsStr = String(item.timestamp_ms).padEnd(14);
      const kfStr = item.state ? 'YES     ' : 'NO      ';
      const stateId = item.state ? item.state.id : 'N/A';
      console.log(`${idxStr} | ${tsStr} | ${kfStr} | ${stateId}`);
    }
    console.log('----------------------------------------------------------------------\n');
  } catch (err: any) {
    console.error(`❌ Error inspecting video record: ${err.message}`);
    process.exit(1);
  }
}

export async function runVideoListCommand(): Promise<void> {
  try {
    const videos = await storage.listVideoRecords(50);
    if (videos.length === 0) {
      console.log('No video memory records found in local database.');
      return;
    }

    console.log(`\n📹 Ingested Video Memory Records (${videos.length}):`);
    console.log('--------------------------------------------------------------------------------');
    console.log(
      'Video ID       | Format | Duration (s) | Unique States | Category     | File Path'
    );
    console.log('--------------------------------------------------------------------------------');
    for (const v of videos) {
      const idStr = v.id.padEnd(14);
      const fmtStr = v.file_format.padEnd(6);
      const durStr = (v.duration_ms / 1000).toFixed(1).padEnd(12);
      const statesStr = String(v.unique_states_count).padEnd(13);
      const catStr = (v.category || 'general').slice(0, 12).padEnd(12);
      const fileStr = v.source_file.slice(-30);
      console.log(`${idStr} | ${fmtStr} | ${durStr} | ${statesStr} | ${catStr} | ${fileStr}`);
    }
    console.log(
      '--------------------------------------------------------------------------------\n'
    );
  } catch (err: any) {
    console.error(`❌ Error listing video records: ${err.message}`);
    process.exit(1);
  }
}
