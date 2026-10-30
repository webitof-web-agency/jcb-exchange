/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CarFront,
  CheckCircle2,
  Copy,
  Download,
  FileDown,
  Loader2,
  QrCode as QrCodeIcon,
  ShieldCheck,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import api from '@/lib/api';
import { getVerificationTemplateBlob, primeVerificationTemplateBlob } from '@/lib/panTemplateCache';
import type { RcOwnerHistoryResponse } from '@/lib/rcOwnerHistory';

const TEMPLATE_SRC = '/templates/rc/rc-blank-template.png';
const BASE_WIDTH = 1024;
const BASE_HEIGHT = 342;
const CANVAS_WIDTH = 2048; // 2x high-resolution rendering
const CANVAS_HEIGHT = 684;
const TEMPLATE_REQUEST_TIMEOUT_MS = 30_000;

export type RcCardData = {
  rcNumber?: string | null;
  maskedRcNumber?: string | null;
  registrationDate?: string | null;
  registrationUpto?: string | null;
  fitUpTo?: string | null;
  rcExpiryDate?: string | null;
  ownerNumber?: string | number | null;
  vehicleChasiNumber?: string | null;
  vehicleEngineNumber?: string | null;
  ownerName?: string | null;
  fatherName?: string | null;
  presentAddress?: string | null;
  permanentAddress?: string | null;
  fuelType?: string | null;
  normsType?: string | null;
  vehicleCategoryDescription?: string | null;
  vehicleCategory?: string | null;
  manufacturingDateFormatted?: string | null;
  manufacturingDate?: string | null;
  noCylinders?: string | number | null;
  makerDescription?: string | null;
  makerModel?: string | null;
  color?: string | null;
  bodyType?: string | null;
  seatCapacity?: string | number | null;
  unladenWeight?: string | number | null;
  cubicCapacity?: string | number | null;
  horsePower?: string | number | null;
  wheelbase?: string | number | null;
  financer?: string | null;
  financed?: boolean | null;
  registeredAt?: string | null;
  [key: string]: unknown;
};

type Props = {
  response?: RcOwnerHistoryResponse | null;
  data?: RcCardData | null;
  embedded?: boolean;
  onUploaded?: (response: RcOwnerHistoryResponse) => void;
};

const safeStr = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  return s === 'null' || s === 'undefined' ? '' : s;
};

const formatRcDate = (value: unknown): string => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const [y, m, d] = trimmed.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return trimmed;
};

const formatRemaining = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The template image could not be read.'));
    reader.onerror = () => reject(new Error('The template image could not be read.'));
    reader.readAsDataURL(blob);
  });

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3,
): string[] => {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  return lines;
};

export default function RcCardTemplatePreview({
  response,
  data: explicitData,
  onUploaded,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadedRef = useRef(false);
  const [downloadPngBusy, setDownloadPngBusy] = useState(false);
  const [downloadPdfBusy, setDownloadPdfBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [templateBlob, setTemplateBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [templateRetry, setTemplateRetry] = useState(0);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [renderError, setRenderError] = useState('');

  const template = response?.template ?? response?.record?.template ?? null;
  const templateId = template?.id;
  const recordId = response?.record?.id;
  const hasResult = response?.record?.status === 'SUCCESS' && Boolean(response?.result);
  const [remaining, setRemaining] = useState(() =>
    response?.record?.rawDataExpiresAt
      ? new Date(response.record.rawDataExpiresAt).getTime() - Date.now()
      : 0
  );
  const expired = remaining <= 0;

  // Revoke previous object URL when previewUrl is replaced, NOT on the same render cycle as the set.
  // We keep a ref to the previous URL so we can revoke it only after the img has had a chance to load.
  const prevPreviewUrlRef = useRef('');
  useEffect(() => {
    const prev = prevPreviewUrlRef.current;
    prevPreviewUrlRef.current = previewUrl;
    if (prev && prev.startsWith('blob:') && prev !== previewUrl) {
      // Delay revoke so the browser can paint the new image first
      const t = window.setTimeout(() => URL.revokeObjectURL(prev), 5000);
      return () => window.clearTimeout(t);
    }
  }, [previewUrl]);

  // Countdown timer for template upload window
  useEffect(() => {
    if (template || !hasResult || uploadedRef.current) return;
    const expiry = response?.record?.rawDataExpiresAt
      ? new Date(response.record.rawDataExpiresAt).getTime()
      : 0;
    if (!expiry) return;
    const tick = () => setRemaining(expiry - Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hasResult, response?.record?.rawDataExpiresAt, template]);

  // Fetch saved template image when viewing from history
  useEffect(() => {
    if (!templateId || !recordId) return;

    let active = true;
    setTemplateError('');

    getVerificationTemplateBlob(
      `rc-owner-history:${recordId}:${templateId}`,
      async () => {
        const res = await api.get<Blob>(
          `/rc-owner-history/${recordId}/template`,
          { responseType: 'blob', timeout: TEMPLATE_REQUEST_TIMEOUT_MS }
        );
        return res.data;
      }
    )
      .then((blob) => {
        if (!active) return;
        setTemplateBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load saved RC template:', err);
        setTemplateError('Saved RC template could not be loaded.');
      });

    return () => {
      active = false;
    };
  }, [recordId, templateId, templateRetry]);

  const rcData = useMemo<RcCardData>(() => {
    if (explicitData) return explicitData;
    const res = (response?.result as RcCardData) || {};
    const rec = response?.record;
    return {
      ...res,
      rcNumber: res.rcNumber || rec?.maskedRcNumber || '',
      maskedRcNumber: rec?.maskedRcNumber || '',
    };
  }, [explicitData, response?.record, response?.result]);

  const effectiveRcNumber = safeStr(rcData.rcNumber) || safeStr(rcData.maskedRcNumber) || 'CG04MB1234';

  // Construct structured QR code payload
  const qrObject = useMemo(() => {
    return {
      rc_number: effectiveRcNumber.replace(/\s+/g, ''),
      chassis_number: safeStr(rcData.vehicleChasiNumber) || undefined,
      engine_number: safeStr(rcData.vehicleEngineNumber) || undefined,
      owner_name: safeStr(rcData.ownerName) || undefined,
      regn_date: formatRcDate(rcData.registrationDate) || undefined,
      valid_upto: formatRcDate(rcData.registrationUpto || rcData.fitUpTo || rcData.rcExpiryDate) || undefined,
      maker: safeStr(rcData.makerDescription) || undefined,
      model: safeStr(rcData.makerModel) || undefined,
      fuel: safeStr(rcData.fuelType) || undefined,
      vehicle_class: safeStr(rcData.vehicleCategoryDescription || rcData.vehicleCategory) || undefined,
      registered_at: safeStr(rcData.registeredAt) || undefined,
    };
  }, [effectiveRcNumber, rcData]);

  const qrJsonText = useMemo(() => JSON.stringify(qrObject, null, 2), [qrObject]);

  // Generate QR Data URL
  useEffect(() => {
    let active = true;

    QRCode.toDataURL(qrJsonText, {
      margin: 0,
      width: 270, // 2x of 135
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate RC QR code:', err);
      });

    return () => {
      active = false;
    };
  }, [qrJsonText]);

  // Render High-DPI Canvas
  useEffect(() => {
    if (template) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let active = true;

    const render = async () => {
      setRenderError('');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      // Clear
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Load base template image
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        bgImg.onload = () => resolve();
        bgImg.onerror = () => reject(new Error('RC template asset could not be loaded.'));
        bgImg.src = TEMPLATE_SRC;
      });

      if (!active) return;

      // Apply 2x scale: all subsequent coordinates use standard 1024x342 space
      ctx.save();
      ctx.scale(2, 2);

      // 1. Draw Template background
      ctx.drawImage(bgImg, 0, 0, BASE_WIDTH, BASE_HEIGHT);

      // 2. Draw Dynamic QR Code on Back Card
      if (qrDataUrl) {
        const qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          qrImg.onload = () => resolve();
          qrImg.onerror = () => resolve();
          qrImg.src = qrDataUrl;
        });

        if (active) {
          // QR box at x=530, y=105, size=130x130 (centered within card left frame)
          ctx.drawImage(qrImg, 530, 105, 130, 130);
        }
      }

      // Helper function to draw single text with optional maxWidth and baseline
      const drawText = (
        text: string,
        x: number,
        y: number,
        font: string,
        color = '#000000',
        align: CanvasTextAlign = 'left',
        baseline: CanvasTextBaseline = 'alphabetic',
        maxWidth?: number,
      ) => {
        if (!text) return;
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = baseline;
        if (maxWidth && ctx.measureText(text).width > maxWidth) {
          ctx.fillText(text, x, y, maxWidth);
        } else {
          ctx.fillText(text, x, y);
        }
        ctx.restore();
      };

      // ─────────────────────────────────────────────────────────────
      // FRONT CARD FIELDS (Left Side: 0..512)
      // ─────────────────────────────────────────────────────────────

      // Regn No: right under label 'Regn No'
      const regNoFormatted = safeStr(rcData.rcNumber) || safeStr(rcData.maskedRcNumber) || '-';
      drawText(regNoFormatted, 149, 112, 'bold 11px Arial, Helvetica, sans-serif', '#000000');

      // Date of Regn: right under label 'Date of Regn.'
      const regDate = formatRcDate(rcData.registrationDate) || '-';
      drawText(regDate, 241, 112, 'bold 10px Arial, Helvetica, sans-serif', '#000000');

      // Regn Validity: right under label 'Regn. Validity' (starts flush at x=320)
      const validityDate = formatRcDate(rcData.registrationUpto || rcData.fitUpTo || rcData.rcExpiryDate) || '-';
      drawText(validityDate, 320, 112, 'bold 10px Arial, Helvetica, sans-serif', '#000000');

      // Owner Serial: centered inside circle at x=475, y=108
      const ownerSerial = safeStr(rcData.ownerNumber) || safeStr(rcData.owner_number) || safeStr(rcData.owner_serial) || '1';
      drawText(ownerSerial, 475, 108, 'bold 11px Arial, Helvetica, sans-serif', '#000000', 'center', 'middle');

      // Chassis No: directly below label 'Chassis No'
      const chassisNo = safeStr(rcData.vehicleChasiNumber) || '-';
      drawText(chassisNo, 149, 145, 'bold 10.5px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 335);

      // Engine/Motor No: directly below label 'Engine/Motor No'
      const engineNo = safeStr(rcData.vehicleEngineNumber) || '-';
      drawText(engineNo, 149, 179, 'bold 10.5px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 335);

      // Owner Name: directly below label 'Owner Name'
      const ownerName = (safeStr(rcData.ownerName) || '-').toUpperCase();
      drawText(ownerName, 149, 212, 'bold 10.5px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 335);

      // Son/Daughter/Wife of: directly below label
      const rawFather = safeStr(rcData.fatherName);
      const fatherName = rawFather ? rawFather.toUpperCase() : '-';
      drawText(fatherName, 149, 247, 'bold 10px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 335);

      // Address: multi-line directly below label 'Address'
      const rawAddr = safeStr(rcData.presentAddress) || safeStr(rcData.permanentAddress) || '-';
      const fullAddr = rawAddr.replace(/,\s*-\s*/g, ', ').replace(/\s+/g, ' ').trim().toUpperCase();
      ctx.save();
      ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
      const addrLines = wrapText(ctx, fullAddr, 335, 2);
      ctx.restore();

      if (addrLines.length === 1) {
        drawText(addrLines[0], 149, 282, 'bold 9px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 335);
      } else if (addrLines.length >= 2) {
        drawText(addrLines[0], 149, 282, 'bold 9px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 335);
        drawText(addrLines[1], 149, 294, 'bold 9px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 335);
      }

      // Fuel: directly below label 'Fuel' (starts flush at x=30 where label starts, baseline y=231)
      const fuel = (safeStr(rcData.fuelType) || '-').toUpperCase();
      drawText(fuel, 30, 231, 'bold 9.5px Arial, Helvetica, sans-serif', '#000000');

      // Emission Norms: directly below label 'Emission Norms' (starts flush at x=30 where label starts, baseline y=270)
      const norms = (safeStr(rcData.normsType) || '-').toUpperCase();
      drawText(norms, 30, 270, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Card Issue Date: vertical rotated along right border of front card
      const cardIssueDate = formatRcDate(rcData.registrationDate) || 'DD-MM-YYYY';
      ctx.save();
      ctx.translate(492, 240);
      ctx.rotate(-Math.PI / 2);
      ctx.font = 'bold 8px Arial, Helvetica, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(`Card Issue Date  (${cardIssueDate})`, 0, 0);
      ctx.restore();

      // ─────────────────────────────────────────────────────────────
      // BACK CARD FIELDS (Right Side: 512..1024)
      // ─────────────────────────────────────────────────────────────

      // Vehicle Class: top banner beside label 'Vehicle Class:' with clean gap after colon (starts at x=722, exact baseline y=46)
      const vClass = (safeStr(rcData.vehicleCategoryDescription) || safeStr(rcData.vehicleCategory) || '-').toUpperCase();
      drawText(vClass, 722, 46, 'bold 10px Arial, Helvetica, sans-serif', '#0f172a', 'left', 'alphabetic', 265);

      // Regn. Number: directly below label 'Regn. Number' (starts flush at x=532)
      drawText(regNoFormatted, 532, 98, 'bold 11px Arial, Helvetica, sans-serif', '#000000');

      // Month -Year of Mfg: directly below label (starts flush at x=532)
      const mfgDate = safeStr(rcData.manufacturingDateFormatted) || safeStr(rcData.manufacturingDate) || '-';
      drawText(mfgDate, 532, 286, 'bold 10px Arial, Helvetica, sans-serif', '#000000');

      // No of Cylinders: next to colon of 'No of Cylinders:' (colon ends at x=618, starts at x=624)
      const cylinders = safeStr(rcData.noCylinders) || '-';
      drawText(cylinders, 624, 302, 'bold 10px Arial, Helvetica, sans-serif', '#000000');

      // Maker: directly below label 'Maker:' (starts flush at x=691)
      const maker = (safeStr(rcData.makerDescription) || '-').toUpperCase();
      drawText(maker, 691, 97, 'bold 10px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 305);

      // Model: directly below label 'Model:' (starts flush at x=691)
      const model = (safeStr(rcData.makerModel) || '-').toUpperCase();
      drawText(model, 691, 132, 'bold 10px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 305);

      // Color: directly below label 'Color:' (starts flush at x=691)
      const color = (safeStr(rcData.color) || '-').toUpperCase();
      drawText(color, 691, 163, 'bold 10px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 110);

      // Body Type: directly below label '/Body Type:' (starts flush at x=808)
      const bodyType = (safeStr(rcData.bodyType) || '-').toUpperCase();
      drawText(bodyType, 808, 163, 'bold 10px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 185);

      // Seating Capacity: directly below label 'Seating(in all) Capacity' (starts flush at x=691)
      const seating = safeStr(rcData.seatCapacity) || '-';
      drawText(seating, 691, 196, 'bold 10px Arial, Helvetica, sans-serif', '#000000');

      // Unladen Weight: directly below label 'Unladen Weight (Kg)' (starts flush at x=691)
      const rawWeight = safeStr(rcData.unladenWeight);
      const unladenWeight = rawWeight ? (rawWeight.toUpperCase().includes('KG') ? rawWeight : `${rawWeight} Kg`) : '-';
      drawText(unladenWeight, 691, 227, 'bold 10px Arial, Helvetica, sans-serif', '#000000');

      // Cubic Cap / HP / Wheel Base: directly below label (starts flush at x=691)
      const cc = safeStr(rcData.cubicCapacity) || '-';
      const hp = safeStr(rcData.horsePower) || '-';
      const wb = safeStr(rcData.wheelbase) || '-';
      const specLine = `${cc}        ${hp}        ${wb}`;
      drawText(specLine, 691, 258, 'bold 9.5px Arial, Helvetica, sans-serif', '#000000');

      // Financier: directly below label 'Financier' (starts flush at x=691)
      let financierText = safeStr(rcData.financer);
      if (!financierText) {
        financierText = rcData.financed === false ? 'NOT FINANCED' : (rcData.financed === true ? 'FINANCED' : '-');
      }
      drawText(financierText.toUpperCase(), 691, 290, 'bold 10px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 170);

      // Registration Authority: directly below label 'Registration Authority' (starts flush at x=884)
      const regAuthority = (safeStr(rcData.registeredAt) || 'RAIPUR RTO, CHHATTISGARH').toUpperCase();
      drawText(regAuthority, 884, 307, 'bold 9px Arial, Helvetica, sans-serif', '#000000', 'left', 'alphabetic', 120);

      ctx.restore();
    };

    render().catch((err) => {
      console.error('RC template render error:', err);
      if (active) setRenderError(err instanceof Error ? err.message : 'RC template rendering failed.');
    });

    return () => {
      active = false;
    };
  }, [qrDataUrl, rcData, template]);

  // Handle canvas click on QR code area
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    // QR Code in 2x space: left=1070 (535*2), top=216 (108*2), width=260, height=260
    if (clickX >= 1060 && clickX <= 1340 && clickY >= 210 && clickY <= 490) {
      setQrModalOpen(true);
    }
  };

  // Source blob resolution: loads from cache/API for saved templates, or generates from canvas
  const getSourceBlob = async (): Promise<Blob> => {
    if (templateBlob) return templateBlob;
    if (template && response?.record?.id) {
      const blob = await getVerificationTemplateBlob(
        `rc-owner-history:${response.record.id}:${template.id}`,
        async () => {
          const res = await api.get<Blob>(
            `/rc-owner-history/${response.record.id}/template`,
            { responseType: 'blob', timeout: TEMPLATE_REQUEST_TIMEOUT_MS }
          );
          return res.data;
        }
      );
      setTemplateBlob(blob);
      return blob;
    }
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('The RC card template is still preparing.');
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The RC card template could not be prepared.');
    return blob;
  };

  // Upload and persist template to history
  const upload = async () => {
    if (!onUploaded || !hasResult || !response?.record?.id || expired) {
      setUploadError('The upload window has expired. Run RC verification again.');
      return;
    }
    setUploadBusy(true);
    setUploadError('');
    try {
      const blob = await getSourceBlob();
      const formData = new FormData();
      const cleanRc = effectiveRcNumber.replace(/[^A-Z0-9]+/gi, '-').toUpperCase() || 'RC';
      formData.append('template', blob, `rc-card-${cleanRc}.png`);
      const res = await api.post<RcOwnerHistoryResponse>(
        `/rc-owner-history/${response.record.id}/template`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      uploadedRef.current = true;
      const savedTemplate = res.data.template ?? res.data.record.template;
      const savedRecordId = res.data.record.id;
      setTemplateBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      if (savedTemplate) {
        primeVerificationTemplateBlob(`rc-owner-history:${savedRecordId}:${savedTemplate.id}`, blob);
      }
      onUploaded({
        ...res.data,
        result: null,
        template: savedTemplate,
      });
    } catch (requestError) {
      const message = requestError as { response?: { data?: { error?: unknown } }; message?: string };
      setUploadError(
        typeof message.response?.data?.error === 'string'
          ? message.response.data.error
          : message.message || 'The RC card template could not be uploaded.'
      );
    } finally {
      setUploadBusy(false);
    }
  };

  // Download high-resolution PNG
  const downloadPng = async () => {
    setDownloadPngBusy(true);
    setUploadError('');
    try {
      const blob = await getSourceBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanRc = effectiveRcNumber.replace(/[^A-Z0-9]+/gi, '-').toUpperCase();
      link.download = `${cleanRc || 'VEHICLE'}-RC-Certificate.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('PNG download failed:', err);
      setUploadError(err instanceof Error ? err.message : 'PNG download failed.');
    } finally {
      setDownloadPngBusy(false);
    }
  };

  // Download printable PDF
  const downloadPdf = async () => {
    setDownloadPdfBusy(true);
    setUploadError('');
    try {
      const blob = await getSourceBlob();
      const image = await blobToDataUrl(blob);
      const { pdf } = await import('@react-pdf/renderer');
      const { RcCardPdfDocument } = await import('./RcCardPdfDocument');
      const cleanRc = effectiveRcNumber.replace(/[^A-Z0-9]+/gi, '-').toUpperCase();
      const pdfBlob = await pdf(<RcCardPdfDocument image={image} rcNumber={cleanRc} />).toBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cleanRc || 'VEHICLE'}-RC-Certificate.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('PDF generation failed:', err);
      setUploadError(err instanceof Error ? err.message : 'PDF generation failed.');
    } finally {
      setDownloadPdfBusy(false);
    }
  };

  const handleCopyJson = () => {
    void navigator.clipboard.writeText(qrJsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!template && !hasResult && !explicitData) return null;

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" role="region" aria-label="RC Card Certificate Preview">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <CarFront className="h-4 w-4" />
            </span>
            <h3 className="text-base font-bold text-slate-900">
              Vehicle Registration Certificate (Form 23A)
            </h3>
            {template ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Template saved {template.fileSize ? `(${formatFileSize(template.fileSize)})` : ''}
              </span>
            ) : hasResult ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                  expired
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {expired ? 'Upload window expired' : `Upload within ${formatRemaining(remaining)}`}
              </span>
            ) : null}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadPng()}
            disabled={downloadPngBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            title="Download high-resolution PNG image"
          >
            {downloadPngBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span>PNG</span>
          </button>

          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloadPdfBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
            title="Download printable A4 PDF certificate"
          >
            {downloadPdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-700" /> : <FileDown className="h-3.5 w-3.5 text-amber-700" />}
            <span>PDF Card</span>
          </button>

          {!template && onUploaded && hasResult && (
            <button
              type="button"
              onClick={() => void upload()}
              disabled={uploadBusy || expired}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              title="Upload & save template to history"
            >
              {uploadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              <span>{uploadBusy ? 'Saving...' : 'Upload & Save Template'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Canvas Card Preview Container */}
      <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-5">
        <div className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-md transition-shadow hover:shadow-lg">
          {template ? (
            templateError ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 p-6 text-center text-xs text-red-600">
                <XCircle className="h-6 w-6 text-red-500" />
                <p className="font-semibold">{templateError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setTemplateError('');
                    setTemplateRetry((v) => v + 1);
                  }}
                  className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 font-bold text-red-700 hover:bg-red-100"
                >
                  Retry Loading
                </button>
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt={`Vehicle Registration Certificate - ${effectiveRcNumber}`}
                className="h-auto w-full select-none"
              />
            ) : (
              <div className="flex min-h-[260px] items-center justify-center text-xs text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-amber-600" /> Loading saved template...
              </div>
            )
          ) : (
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className="h-auto w-full cursor-pointer select-none transition-transform"
              title="Click QR Code to view payload"
            />
          )}
          {/* Legacy hint overlay intentionally removed from the rendered UI.

            <span className="font-mono text-[10px] text-slate-400">1024 × 342 px (Hi-DPI)</span>
          */}
        </div>

        {uploadError ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        ) : null}

        {renderError ? (
          <div className="mt-3 text-xs font-semibold text-rose-600">{renderError}</div>
        ) : null}
      </div>

      {/* Interactive QR Code Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <QrCodeIcon className="h-4.5 w-4.5 text-amber-600" />
                <span>mParivahan RC QR Code Data</span>
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* QR Image preview */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Vehicle RC QR Code" className="h-44 w-44 rounded-lg bg-white p-2 shadow-sm" />
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center text-xs text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                  </div>
                )}
                <span className="mt-2 text-[11px] font-semibold text-slate-500">Scan with any mobile camera or QR app</span>
              </div>

              {/* JSON Payload viewer */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">Decoded Structured Data (JSON)</span>
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900"
                  >
                    {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-[11px] font-mono leading-relaxed text-amber-300">
                  {qrJsonText}
                </pre>
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setQrModalOpen(false)}
                  className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

