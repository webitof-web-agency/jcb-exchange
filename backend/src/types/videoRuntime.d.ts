declare module 'ffmpeg-static' {
  const binaryPath: string | null;
  export default binaryPath;
}

declare module 'ffprobe-static' {
  const runtime: { path: string };
  export default runtime;
}
