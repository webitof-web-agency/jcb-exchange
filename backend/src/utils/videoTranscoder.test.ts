import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {
  getOptimizedVideoFilename,
  getVideoTranscodeArguments,
  MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_OUTPUT_SIZE_BYTES,
  transcodeListingVideo,
} from './videoTranscoder';

const runBinary = (binaryPath: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(binaryPath, args, { windowsHide: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Process exited with code ${code ?? 'unknown'}.`));
    });
  });

test('builds a web-compatible MP4 transcode profile with muted audio', () => {
  const args = getVideoTranscodeArguments('input.mov', 'output.mp4');

  assert.deepEqual(args, [
    '-y',
    '-i',
    'input.mov',
    '-t',
    String(MAX_VIDEO_DURATION_SECONDS),
    '-map',
    '0:v:0',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-level',
    '4.0',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-r',
    '30',
    '-b:v',
    '1200k',
    '-maxrate',
    '1600k',
    '-bufsize',
    '3200k',
    '-movflags',
    '+faststart',
    '-fs',
    String(MAX_VIDEO_OUTPUT_SIZE_BYTES),
    'output.mp4',
  ]);
});

test('creates a safe final MP4 filename without preserving the source extension', () => {
  assert.equal(getOptimizedVideoFilename('walkaround.MOV'), 'walkaround.mp4');
  assert.equal(getOptimizedVideoFilename('vehicle video.webm'), 'vehicle-video.mp4');
});

test('transcodes a sample video to muted H.264 MP4 and cleans up the source separately', async () => {
  assert.ok(ffmpegPath);
  assert.ok(ffprobe?.path);

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'jcb-video-test-'));
  const inputPath = path.join(tempDirectory, 'source.mov');

  try {
    await runBinary(ffmpegPath, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x180:r=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1000:sample_rate=44100',
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      inputPath,
    ]);

    const optimized = await transcodeListingVideo({
      inputPath,
      outputDirectory: tempDirectory,
      originalName: 'source.mov',
    });
    const probeOutput: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        ffprobe.path,
        ['-v', 'error', '-show_streams', '-of', 'json', optimized.outputPath],
        { windowsHide: true }
      );
      child.stdout?.on('data', (chunk: Buffer | string) => probeOutput.push(chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffprobe exited with ${code}.`))));
    });

    const streams = JSON.parse(probeOutput.join('')).streams as Array<{ codec_type: string; codec_name: string }>;
    assert.equal(path.extname(optimized.outputFilename), '.mp4');
    assert.ok(optimized.size > 0);
    assert.ok(optimized.size <= MAX_VIDEO_OUTPUT_SIZE_BYTES);
    assert.ok(streams.some((stream) => stream.codec_type === 'video' && stream.codec_name === 'h264'));
    assert.equal(streams.some((stream) => stream.codec_type === 'audio'), false);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
