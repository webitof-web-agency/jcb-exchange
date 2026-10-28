'use client';

import NextImage from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';
import QRCode from 'qrcode';
import api from '@/lib/api';
import { resolvePanTemplateNumber, type PanResultResponse } from '@/lib/panVerification';
import { getPanTemplateBlob } from '@/lib/panTemplateCache';

const TEMPLATE_ASSET = '/images/pancard/pan-card-base-template.jpg';
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 636;
const MAX_PAN_PHOTO_BYTES = 1 * 1024 * 1024;
const MAX_PAN_SIGNATURE_BYTES = 500 * 1024;
const ACCEPTED_PAN_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Pixel-accurate coordinates on the 1024 × 636 base template image:
 * - PAN Number: Centered at x: 470, y: 276 (below 'Permanent Account Number Card')
 * - Full Name: x: 58, y: 416 (below 'नाम / Name' label which ends at y: 380)
 * - Father's Name: x: 58, y: 502 (below 'पिता का नाम / Father's Name' label which ends at y: 464)
 * - Date of Birth: x: 58, y: 612 (below 'जन्म की तारीख / Date of Birth' label which ends at y: 568 - ZERO overlap)
 * - Signature: Centered at x: 440, y: 518-576 (directly centered above 'हस्ताक्षर / Signature' label)
 */
const PAN_FIELD_POSITIONS = {
  fullName: { x: 58, y: 416, maxWidth: 420 },
  fatherName: { x: 58, y: 502, maxWidth: 420 },
  dateOfBirth: { x: 58, y: 612, maxWidth: 330 },
  panNumber: { x: 470, y: 276, maxWidth: 400 },
  photo: { x: 58, y: 174, width: 180, height: 190 },
  signature: { x: 330, y: 518, width: 220, height: 58 },
} as const;

export function formatPanDate(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const parts = clean.split('T')[0].split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  if (/^\d{4}\/\d{2}\/\d{2}/.test(clean)) {
    const parts = clean.split('T')[0].split('/');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    return clean;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    return clean.replace(/-/g, '/');
  }
  return clean;
}

const objectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringValue = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();
      if (!['not available', 'not applicable', '—', '-', 'null', 'undefined'].includes(trimmed.toLowerCase())) {
        return trimmed;
      }
    }
  }
  return '';
};

const fitText = (context: CanvasRenderingContext2D, value: string, maxWidth: number, startingSize: number) => {
  let size = startingSize;
  while (size > 12) {
    context.font = `900 ${size}px Arial, sans-serif`;
    if (context.measureText(value).width <= maxWidth) return;
    size -= 1;
  }
};

const drawField = (context: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, startingSize = 24) => {
  if (!value) return;
  fitText(context, value, maxWidth, startingSize);
  context.fillText(value, x, y);
};

const formatRemaining = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const formatFileSize = (value: number) => `${Math.max(1, Math.round(value / 1024))} KB`;

const validateOptionalImage = (file: File, label: string, maxBytes: number) => {
  if (!ACCEPTED_PAN_IMAGE_TYPES.has(file.type)) {
    return 'Only JPG, PNG, and WEBP files are allowed for the ' + label.toLowerCase() + '.';
  }
  if (file.size > maxBytes) {
    return label + ' must be ' + Math.round(maxBytes / 1024) + ' KB or smaller.';
  }
  return '';
};

const loadImage = (source: string | File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const objectUrl = source instanceof File ? URL.createObjectURL(source) : source;
  const image = new Image();
  image.onload = () => {
    if (source instanceof File) URL.revokeObjectURL(objectUrl);
    if (!image.naturalWidth || !image.naturalHeight) {
      reject(new Error('The selected image could not be decoded.'));
      return;
    }
    resolve(image);
  };
  image.onerror = () => {
    if (source instanceof File) URL.revokeObjectURL(objectUrl);
    reject(new Error('The selected image could not be decoded.'));
  };
  image.src = objectUrl;
});

const drawCoverImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  context.restore();
};

const drawContainImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The template image could not be read.'));
  reader.onerror = () => reject(new Error('The template image could not be read.'));
  reader.readAsDataURL(blob);
});

type Props = {
  response: PanResultResponse;
  onUploaded?: (response: PanResultResponse) => void;
  panNumber?: string;
};

export default function PanTemplatePreview({ response, onUploaded, panNumber }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasUploadedRef = useRef(false);
  const [remaining, setRemaining] = useState(() =>
    response.record.rawDataExpiresAt
      ? new Date(response.record.rawDataExpiresAt).getTime() - Date.now()
      : 0
  );
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadPngBusy, setDownloadPngBusy] = useState(false);
  const [templateBlob, setTemplateBlob] = useState<Blob | null>(null);
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const details = objectValue(response.result?.panDetails);
  const providerData = objectValue(response.result?.providerData);
  const providerDetails = objectValue(providerData.pan_details);

  const fullName = stringValue(
    details.fullName,
    details.full_name,
    response.result?.fullName,
    response.result?.name,
    providerData.full_name,
    providerData.fullName,
    providerData.name,
    providerDetails.full_name,
    providerDetails.fullName,
  );

  const fatherName = stringValue(
    details.fatherName,
    details.father_name,
    response.result?.fatherName,
    response.result?.father_name,
    objectValue(providerData.pan_to_father_name).father_name,
    objectValue(providerData.pan_to_father_name).fatherName,
    providerData.father_name,
    providerData.fatherName,
    providerData.care_of,
    providerDetails.father_name,
    providerDetails.fatherName,
  );

  const rawDob = stringValue(
    details.dob,
    details.dateOfBirth,
    details.inputDob,
    response.result?.dob,
    response.result?.dateOfBirth,
    providerData.dob,
    providerData.date_of_birth,
    providerDetails.dob,
  );
  const dateOfBirth = formatPanDate(rawDob);

  const rawPan = stringValue(
    panNumber,
    response.result?.panNumber,
    response.result?.pan,
    providerData.pan_number,
    response.record.maskedPan,
  );
  const templatePanNumber = resolvePanTemplateNumber(rawPan, response.record.maskedPan);
  const hasSavedTemplate = Boolean(response.template);
  const templateId = response.template?.id;

  useEffect(() => {
    if (response.template || !response.result || hasUploadedRef.current) return;
    const expiry = response.record.rawDataExpiresAt ? new Date(response.record.rawDataExpiresAt).getTime() : 0;
    const tick = () => setRemaining(expiry - Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [response.record.rawDataExpiresAt, response.result, response.template]);

  useEffect(() => {
    if (hasSavedTemplate) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isMounted = true;

    const render = async () => {
      // 1. Build plain text data payload for QR code scanner
      const qrLines = [
        'INCOME TAX DEPARTMENT',
        `PAN: ${templatePanNumber}`,
        fullName ? `Name: ${fullName.toUpperCase()}` : '',
        fatherName ? `Father's Name: ${fatherName.toUpperCase()}` : '',
        dateOfBirth ? `Date of Birth: ${dateOfBirth}` : '',
      ].filter(Boolean);
      const qrText = qrLines.join('\n') || `PAN: ${templatePanNumber}`;

      let qrDataUrl = '';
      try {
        qrDataUrl = await QRCode.toDataURL(qrText, {
          margin: 1,
          width: 245,
          errorCorrectionLevel: 'M',
        });
      } catch {
        // Fall back gracefully if QR generation fails
      }

      if (!isMounted) return;

      let baseImage: HTMLImageElement;
      let photoImage: HTMLImageElement | null = null;
      let signatureImage: HTMLImageElement | null = null;
      try {
        [baseImage, photoImage, signatureImage] = await Promise.all([
          loadImage(TEMPLATE_ASSET),
          photoFile ? loadImage(photoFile) : Promise.resolve(null),
          signatureFile ? loadImage(signatureFile) : Promise.resolve(null),
        ]);
      } catch (imageError) {
        if (isMounted) setError(imageError instanceof Error ? imageError.message : 'The selected image could not be decoded.');
        return;
      }
      if (!isMounted) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      // 1. Draw 1:1 base template image
      context.drawImage(baseImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const drawOverlays = () => {
          if (photoImage) {
            drawCoverImage(context, photoImage, PAN_FIELD_POSITIONS.photo.x, PAN_FIELD_POSITIONS.photo.y, PAN_FIELD_POSITIONS.photo.width, PAN_FIELD_POSITIONS.photo.height);
          }

          // 2. PAN Number: Solid dark black, bold, prominent sans-serif (matching reference image)
          if (templatePanNumber) {
            context.fillStyle = '#000000';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = '900 34px "Arial Black", Impact, Arial, sans-serif';
            context.fillText(templatePanNumber, PAN_FIELD_POSITIONS.panNumber.x, PAN_FIELD_POSITIONS.panNumber.y);
          }

          // 3. Full Name: Below 'नाम / Name'
          context.textAlign = 'left';
          context.textBaseline = 'alphabetic';
          context.fillStyle = '#08152a';
          if (fullName) {
            drawField(context, fullName.toUpperCase(), PAN_FIELD_POSITIONS.fullName.x, PAN_FIELD_POSITIONS.fullName.y, PAN_FIELD_POSITIONS.fullName.maxWidth, 24);
          }

          // 4. Father's Name: Below 'पिता का नाम / Father's Name'
          if (fatherName) {
            drawField(context, fatherName.toUpperCase(), PAN_FIELD_POSITIONS.fatherName.x, PAN_FIELD_POSITIONS.fatherName.y, PAN_FIELD_POSITIONS.fatherName.maxWidth, 23);
          }

          // 5. Date of Birth: Below 'जन्म की तारीख / Date of Birth' label (y: 612 ensures zero collision)
          if (dateOfBirth) {
            context.font = '900 22px monospace, "Courier New", Courier';
            context.fillStyle = '#08152a';
            context.fillText(dateOfBirth, PAN_FIELD_POSITIONS.dateOfBirth.x, PAN_FIELD_POSITIONS.dateOfBirth.y);
          }

          if (signatureImage) {
            drawContainImage(context, signatureImage, PAN_FIELD_POSITIONS.signature.x, PAN_FIELD_POSITIONS.signature.y, PAN_FIELD_POSITIONS.signature.width, PAN_FIELD_POSITIONS.signature.height);
          }
      };

      if (qrDataUrl) {
        const qrImg = new Image();
        qrImg.onload = () => {
          if (!isMounted) return;
          context.fillStyle = '#ffffff';
          context.fillRect(712, 201, 245, 245);
          context.drawImage(qrImg, 712, 201, 245, 245);
          drawOverlays();
        };
        qrImg.onerror = () => {
          if (!isMounted) return;
          drawOverlays();
        };
        qrImg.src = qrDataUrl;
      } else {
        drawOverlays();
      }
    };

    render();

    return () => {
      isMounted = false;
    };
  }, [dateOfBirth, fatherName, fullName, hasSavedTemplate, photoFile, rawPan, signatureFile, templatePanNumber]);
  useEffect(() => {
    if (!templateId) return;
    let active = true;
    let objectUrl = '';
    const cacheKey = response.record.id + ':' + templateId;
    getPanTemplateBlob(cacheKey, async () => {
      const result = await api.get<Blob>(`/pan-verification/${response.record.id}/template`, { responseType: 'blob' });
      return result.data;
    })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setTemplateBlob(blob);
        setTemplatePreviewUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError('The saved PAN template could not be loaded.');
      })
;
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [response.record.id, templateId]);
  const selectOptionalImage = (kind: 'photo' | 'signature', file: File | null) => {
    if (!file) return;
    const label = kind === 'photo' ? 'Photo' : 'Signature';
    const maxBytes = kind === 'photo' ? MAX_PAN_PHOTO_BYTES : MAX_PAN_SIGNATURE_BYTES;
    const validationError = validateOptionalImage(file, label, maxBytes);
    if (validationError) {
      setError(validationError);
      if (kind === 'photo' && photoInputRef.current) photoInputRef.current.value = '';
      if (kind === 'signature' && signatureInputRef.current) signatureInputRef.current.value = '';
      return;
    }
    setError('');
    if (kind === 'photo') setPhotoFile(file);
    else setSignatureFile(file);
  };
  const clearOptionalImage = (kind: 'photo' | 'signature') => {
    if (kind === 'photo') {
      setPhotoFile(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
    } else {
      setSignatureFile(null);
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };
  const upload = async () => {
    if (!onUploaded) return;
    const canvas = canvasRef.current;
    if (!canvas || remaining <= 0) {
      setError('The five-minute template window has expired. Run PAN verification again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The PAN template could not be prepared.');
      const formData = new FormData();
      formData.append('template', blob, `pan-${response.record.maskedPan.replace(/[^A-Z0-9]/gi, '')}.png`);
      const result = await api.post<PanResultResponse>(`/pan-verification/${response.record.id}/template`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
          hasUploadedRef.current = true;
          setRemaining(0);
          setPhotoFile(null);
          setSignatureFile(null);
          if (photoInputRef.current) photoInputRef.current.value = '';
          if (signatureInputRef.current) signatureInputRef.current.value = '';
          onUploaded({ ...result.data, result: null });
    } catch (requestError) {
      const message = requestError as { response?: { data?: { error?: unknown } }; message?: string };
      setError(
        typeof message.response?.data?.error === 'string'
          ? message.response.data.error
          : message.message || 'The PAN template could not be uploaded.'
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    setDownloadBusy(true);
    setError('');
    try {
      let sourceBlob = templateBlob;
      if (response.template && !sourceBlob) {
        sourceBlob = await getPanTemplateBlob(response.record.id + ':' + response.template.id, async () => {
          const result = await api.get<Blob>(`/pan-verification/${response.record.id}/template`, { responseType: 'blob' });
          return result.data;
        });
      }
      if (!sourceBlob) {
        const canvas = canvasRef.current;
        if (!canvas || canvas.width !== CANVAS_WIDTH) throw new Error('The PAN template is still preparing.');
        sourceBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      }
      if (!sourceBlob) throw new Error('The PAN template could not be prepared.');
      const image = await blobToDataUrl(sourceBlob);
      const { pdf } = await import('@react-pdf/renderer');
      const { PanTemplatePdfDocument } = await import('./PanTemplatePdfDocument');
      const pdfBlob = await pdf(<PanTemplatePdfDocument image={image} />).toBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      const safePan = (templatePanNumber || response.record.maskedPan || 'card').replace(/[^A-Z0-9*]/gi, '');
      link.href = url;
      link.download = `pan-template-${safePan}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      const message = requestError as { response?: { data?: { error?: unknown } }; message?: string };
      setError(typeof message.response?.data?.error === 'string' ? message.response.data.error : message.message || 'The PAN PDF could not be prepared.');
    } finally {
      setDownloadBusy(false);
    }
  };

  const downloadPng = async () => {
    setDownloadPngBusy(true);
    setError('');
    try {
      const safePan = (templatePanNumber || response.record.maskedPan || 'card').replace(/[^A-Z0-9*]/gi, '');
      const fileName = `pan-template-${safePan}.png`;

      let url = '';
      let shouldRevoke = false;

      if (templateBlob) {
        url = URL.createObjectURL(templateBlob);
        shouldRevoke = true;
      } else if (response.template) {
        const blob = await getPanTemplateBlob(response.record.id + ':' + response.template.id, async () => {
          const result = await api.get<Blob>(`/pan-verification/${response.record.id}/template`, { responseType: 'blob' });
          return result.data;
        });
        setTemplateBlob(blob);
        url = URL.createObjectURL(blob);
        shouldRevoke = true;
      } else {
        const canvas = canvasRef.current;
        if (!canvas || canvas.width !== CANVAS_WIDTH) throw new Error('The PAN template is still preparing.');
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('The PAN PNG could not be prepared.');
        url = URL.createObjectURL(blob);
        shouldRevoke = true;
      }

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (shouldRevoke) {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (requestError) {
      const message = requestError as { response?: { data?: { error?: unknown } }; message?: string };
      setError(typeof message.response?.data?.error === 'string' ? message.response.data.error : message.message || 'The PAN PNG could not be prepared.');
    } finally {
      setDownloadPngBusy(false);
    }
  };

  const expired = remaining <= 0;
  const hasRenderableTemplate = Boolean(response.template || response.result);
  if (!hasRenderableTemplate) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-linear-to-b from-slate-50 to-slate-100/60 p-4 shadow-xs sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3.5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">PAN Template</h3>
          <p className="mt-1 text-xs text-slate-500">Secure generated PAN template</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {response.template ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved template ({formatFileSize(response.template.fileSize)})
            </span>
          ) : onUploaded && response.result ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
              <ShieldCheck className="h-3.5 w-3.5" /> {expired ? 'Upload window expired' : `Upload within ${formatRemaining(remaining)}`}
            </span>
          ) : null}
          <button type="button" onClick={downloadPng} disabled={downloadPngBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            {downloadPngBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-slate-600" />} {downloadPngBusy ? 'Preparing PNG...' : 'Download PNG'}
          </button>
          <button type="button" onClick={downloadPdf} disabled={downloadBusy} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {downloadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {downloadBusy ? 'Preparing PDF...' : 'Download PDF'}
          </button>
          {!response.template && onUploaded && response.result ? (
            <button type="button" onClick={upload} disabled={busy || expired} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-xs transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {busy ? 'Uploading...' : 'Upload template'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {!response.template && response.result ? (
        <div className="mt-3 grid gap-3 border-b border-slate-200/60 pb-3.5 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-800">Photo (optional)</p>
                <p className="mt-1 text-[11px] text-slate-500">JPG, PNG, WEBP · max 1 MB · passport ratio preferred</p>
              </div>
              {photoFile ? <button type="button" onClick={() => clearOptionalImage('photo')} className="text-[11px] font-semibold text-slate-500 hover:text-red-600">Remove</button> : null}
            </div>
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectOptionalImage('photo', event.target.files?.[0] || null)} className="mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200" />
            {photoFile ? <p className="mt-1 truncate text-[11px] text-emerald-700">{photoFile.name} · {formatFileSize(photoFile.size)}</p> : null}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-800">Signature (optional)</p>
                <p className="mt-1 text-[11px] text-slate-500">Transparent PNG preferred · max 500 KB</p>
              </div>
              {signatureFile ? <button type="button" onClick={() => clearOptionalImage('signature')} className="text-[11px] font-semibold text-slate-500 hover:text-red-600">Remove</button> : null}
            </div>
            <input ref={signatureInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectOptionalImage('signature', event.target.files?.[0] || null)} className="mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200" />
            {signatureFile ? <p className="mt-1 truncate text-[11px] text-emerald-700">{signatureFile.name} · {formatFileSize(signatureFile.size)}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-center overflow-x-auto py-2">
        <div className="relative max-w-full overflow-hidden rounded-[14px] shadow-[0_12px_30px_-5px_rgba(15,23,42,0.30)]">
          {response.template ? (
            templatePreviewUrl ? <NextImage src={templatePreviewUrl} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} unoptimized className="block h-auto w-[490px] max-w-full select-none" alt="Saved PAN template" /> : (
              <div className="flex h-64 w-[490px] max-w-full items-center justify-center text-xs text-slate-500">Loading saved template...</div>
            )
          ) : (
            <canvas ref={canvasRef} className="block h-auto w-[490px] max-w-full select-none" aria-label="Generated PAN template" />
          )}
        </div>
      </div>
    </section>
  );
}
