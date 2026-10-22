import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_CONVERSION_TIME_MS = 60_000;

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const candidatePaths = () => {
  const configured = [process.env.LIBREOFFICE_PATH, process.env.SOFFICE_PATH, process.env.WORD_PATH].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  const windows = process.platform === 'win32'
    ? [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'LibreOffice', 'program', 'soffice.exe') : '',
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Microsoft Office', 'root', 'Office16', 'WINWORD.EXE') : '',
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'LibreOffice', 'program', 'soffice.exe') : '',
    ]
    : [];
  const pathExecutables = (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((directory) => [path.join(directory, process.platform === 'win32' ? 'soffice.exe' : 'soffice'), path.join(directory, process.platform === 'win32' ? 'libreoffice.exe' : 'libreoffice')]);
  const unix = process.platform === 'win32' ? [] : ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice', '/usr/local/bin/libreoffice'];
  return [...configured, ...windows, ...pathExecutables, ...unix].filter(Boolean);
};

export const converterKindForPath = (converterPath: string) =>
  /(?:soffice|libreoffice)(?:\.exe)?$/i.test(path.basename(converterPath)) ? 'LIBREOFFICE' as const : 'WORD' as const;

const findConverter = async () => {
  for (const candidate of candidatePaths()) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
};

const base64Path = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const convertWithWord = async (wordPath: string, inputPath: string, outputPath: string) => {
  if (process.platform !== 'win32') throw new Error('Microsoft Word DOCX conversion is only available on Windows.');
  const input = base64Path(inputPath);
  const output = base64Path(outputPath);
  const script = `
$ErrorActionPreference = 'Stop'
$inputPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${input}'))
$outputPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${output}'))
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($inputPath, $false, $true)
  $document.ExportAsFixedFormat($outputPath, 17)
} finally {
  if ($document) { $document.Close($false) }
  if ($word) { $word.Quit() }
}
`;
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], { timeout: MAX_CONVERSION_TIME_MS, windowsHide: true, maxBuffer: 1024 * 1024 });
  if (!await fileExists(outputPath)) throw new Error('Microsoft Word did not produce a PDF output.');
  void wordPath;
};

const convertWithLibreOffice = async (sofficePath: string, inputPath: string, outputDir: string, profileDir: string) => {
  await execFileAsync(sofficePath, [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    '--headless',
    '--nologo',
    '--nodefault',
    '--nofirststartwizard',
    '--norestore',
    '--convert-to',
    'pdf',
    '--outdir',
    outputDir,
    inputPath,
  ], { timeout: MAX_CONVERSION_TIME_MS, windowsHide: true, maxBuffer: 1024 * 1024 });
};

export const convertDocxToPdf = async (docxBuffer: Buffer, outputFileName = 'document.pdf') => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'jcb-exchange-docx-'));
  const inputPath = path.join(temporaryDirectory, 'source.docx');
  const outputPath = path.join(temporaryDirectory, outputFileName.replace(/[^A-Za-z0-9._-]/g, '-'));
  const converterPath = await findConverter();

  try {
    if (!converterPath) {
      throw new Error('DOCX-to-PDF conversion is not configured. Install LibreOffice on the server or set LIBREOFFICE_PATH/SOFFICE_PATH.');
    }
    await fs.writeFile(inputPath, docxBuffer);
    if (converterKindForPath(converterPath) === 'LIBREOFFICE') {
      const libreOfficeProfile = path.join(temporaryDirectory, 'libreoffice-profile');
      await fs.mkdir(libreOfficeProfile, { recursive: true });
      await convertWithLibreOffice(converterPath, inputPath, temporaryDirectory, libreOfficeProfile);
    } else {
      await convertWithWord(converterPath, inputPath, outputPath);
    }
    const convertedPath = converterKindForPath(converterPath) === 'LIBREOFFICE'
      ? path.join(temporaryDirectory, 'source.pdf')
      : outputPath;
    if (!await fileExists(convertedPath)) throw new Error('DOCX-to-PDF conversion completed without a PDF output.');
    return await fs.readFile(convertedPath);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
};
