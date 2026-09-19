import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

export const MAX_VIDEO_DURATION_SECONDS = 60;
export const MAX_VIDEO_OUTPUT_SIZE_BYTES = 14 * 1024 * 1024;
const VIDEO_TRANSCODE_TIMEOUT_MS = 2 * 60 * 1000;

const runProcess = (binaryPath: string, args: string[], timeoutMs: number) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(binaryPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new Error('Video processing timed out.')));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finish(() => reject(error));
    });
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        const details = stderr.trim().split(/\r?\n/).slice(-3).join(' ');
        reject(new Error(`Video processing failed${details ? `: ${details}` : '.'}`));
      });
    });
  });

export const getOptimizedVideoFilename = (originalName: string) => {
  const baseName = path.basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return `${baseName || 'listing-video'}.mp4`;
};

export const getVideoTranscodeArguments = (inputPath: string, outputPath: string) => [
  '-y',
  '-i',
  inputPath,
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
  outputPath,
];

const getVideoDurationSeconds = async (inputPath: string) => {
  if (!ffprobe?.path) {
    throw new Error('Video metadata processor is not available.');
  }

  const { stdout } = await runProcess(
    ffprobe.path,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath],
    30_000
  );
  const duration = Number.parseFloat(stdout.trim());

  if (!Number.isFinite(duration)) {
    throw new Error('Unable to read video duration.');
  }

  return duration;
};

export const transcodeListingVideo = async ({
  inputPath,
  outputDirectory,
  originalName,
}: {
  inputPath: string;
  outputDirectory: string;
  originalName: string;
}) => {
  if (!ffmpegPath) {
    throw new Error('Video encoder is not available.');
  }

  const duration = await getVideoDurationSeconds(inputPath);
  if (duration > MAX_VIDEO_DURATION_SECONDS) {
    throw new Error(`Video duration must be ${MAX_VIDEO_DURATION_SECONDS} seconds or shorter.`);
  }

  const outputFilename = `${path.basename(getOptimizedVideoFilename(originalName), '.mp4')}-${randomUUID()}.mp4`;
  const outputPath = path.join(outputDirectory, outputFilename);

  try {
    await runProcess(ffmpegPath, getVideoTranscodeArguments(inputPath, outputPath), VIDEO_TRANSCODE_TIMEOUT_MS);
    const outputStats = await fs.stat(outputPath);

    if (outputStats.size <= 0 || outputStats.size > MAX_VIDEO_OUTPUT_SIZE_BYTES) {
      throw new Error('Optimized video is larger than the allowed output size.');
    }

    return {
      outputPath,
      outputFilename,
      size: outputStats.size,
      durationSeconds: duration,
    };
  } catch (error) {
    await fs.rm(outputPath, { force: true });
    throw error;
  }
};
