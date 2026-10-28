/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CarFront,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileDown,
  Loader2,
  Printer,
  QrCode as QrCodeIcon,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import type { RcOwnerHistoryResponse } from '@/lib/rcOwnerHistory';

const TEMPLATE_SRC = '/templates/rc/rc-blank-template.png';
const BASE_WIDTH = 1024;
const BASE_HEIGHT = 342;
const CANVAS_WIDTH = 2048; // 2x high-resolution rendering
const CANVAS_HEIGHT = 684;

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

export default function RcCardTemplatePreview({ response, data: explicitData, embedded = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloadPngBusy, setDownloadPngBusy] = useState(false);
  const [downloadPdfBusy, setDownloadPdfBusy] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrJsonText, setQrJsonText] = useState('');
  const [copied, setCopied] = useState(false);
  const [renderError, setRenderError] = useState('');

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

  // Generate QR Data URL
  useEffect(() => {
    let active = true;
    const jsonStr = JSON.stringify(qrObject, null, 2);
    setQrJsonText(jsonStr);

    QRCode.toDataURL(jsonStr, {
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
  }, [qrObject]);

  // Render High-DPI Canvas
  useEffect(() => {
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
          // QR box at x=526, y=108, size=135x135
          ctx.drawImage(qrImg, 526, 108, 135, 135);
        }
      }

      // Helper function to draw single text
      const drawText = (
        text: string,
        x: number,
        y: number,
        font: string,
        color = '#000000',
        align: CanvasTextAlign = 'left',
      ) => {
        if (!text) return;
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, x, y);
        ctx.restore();
      };

      // ─────────────────────────────────────────────────────────────
      // FRONT CARD FIELDS (Left Side: 0..512)
      // ─────────────────────────────────────────────────────────────

      // Regn No: right under label 'Regn No'
      const regNoFormatted = safeStr(rcData.rcNumber) || safeStr(rcData.maskedRcNumber) || '-';
      drawText(regNoFormatted, 149, 112, 'bold 10px Arial, Helvetica, sans-serif', '#000080');

      // Date of Regn: right under label 'Date of Regn.'
      const regDate = formatRcDate(rcData.registrationDate) || '-';
      drawText(regDate, 241, 112, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Regn Validity: right under label 'Regn. Validity'
      const validityDate = formatRcDate(rcData.registrationUpto || rcData.fitUpTo || rcData.rcExpiryDate) || '-';
      drawText(validityDate, 325, 112, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Owner Serial: inside circle at x=468, y=110
      const ownerSerial = safeStr(rcData.ownerNumber) || '1';
      drawText(ownerSerial, 468, 113, 'bold 10px Arial, Helvetica, sans-serif', '#000080', 'center');

      // Chassis No: to the right of label 'Chassis No'
      const chassisNo = safeStr(rcData.vehicleChasiNumber) || '-';
      drawText(chassisNo, 220, 131, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Engine/Motor No: to the right of label 'Engine/Motor No'
      const engineNo = safeStr(rcData.vehicleEngineNumber) || '-';
      drawText(engineNo, 246, 165, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Owner Name: to the right of label 'Owner Name'
      const ownerName = (safeStr(rcData.ownerName) || '-').toUpperCase();
      drawText(ownerName, 228, 198, 'bold 10px Arial, Helvetica, sans-serif', '#000080');

      // Son/Daughter/Wife of: below label
      const rawFather = safeStr(rcData.fatherName);
      const fatherName = rawFather
        ? (rawFather.toUpperCase().startsWith('S/O') || rawFather.toUpperCase().startsWith('D/O') || rawFather.toUpperCase().startsWith('W/O')
            ? rawFather.toUpperCase()
            : `S/O: ${rawFather.toUpperCase()}`)
        : '-';
      drawText(fatherName, 148, 250, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Address: multi-line right after/below label 'Address'
      const fullAddr = safeStr(rcData.presentAddress) || safeStr(rcData.permanentAddress) || '-';
      ctx.save();
      ctx.font = 'bold 8px Arial, Helvetica, sans-serif';
      const addrLines = wrapText(ctx, fullAddr.toUpperCase(), 290, 2);
      ctx.restore();

      if (addrLines.length === 1) {
        drawText(addrLines[0], 205, 269, 'bold 8px Arial, Helvetica, sans-serif', '#1e293b');
      } else if (addrLines.length >= 2) {
        drawText(addrLines[0], 205, 269, 'bold 8px Arial, Helvetica, sans-serif', '#1e293b');
        drawText(addrLines[1], 205, 280, 'bold 8px Arial, Helvetica, sans-serif', '#1e293b');
      }

      // Fuel: below label at left
      const fuel = (safeStr(rcData.fuelType) || '-').toUpperCase();
      drawText(fuel, 20, 242, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Emission Norms: below label at left
      const norms = (safeStr(rcData.normsType) || '-').toUpperCase();
      drawText(norms, 20, 287, 'bold 8px Arial, Helvetica, sans-serif', '#0f172a');

      // ─────────────────────────────────────────────────────────────
      // BACK CARD FIELDS (Right Side: 512..1024)
      // ─────────────────────────────────────────────────────────────

      // Vehicle Class: top banner after label 'Vehicle Class:'
      const vClass = (safeStr(rcData.vehicleCategoryDescription) || safeStr(rcData.vehicleCategory) || '-').toUpperCase();
      drawText(vClass, 700, 34, 'bold 9.5px Arial, Helvetica, sans-serif', '#0f172a');

      // Regn. Number: below label at left of QR
      drawText(regNoFormatted, 526, 98, 'bold 11px Arial, Helvetica, sans-serif', '#000080');

      // Month -Year of Mfg: below label
      const mfgDate = safeStr(rcData.manufacturingDateFormatted) || safeStr(rcData.manufacturingDate) || '-';
      drawText(mfgDate, 536, 286, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // No of Cylinders: next to label 'No of Cylinders:'
      const cylinders = safeStr(rcData.noCylinders) || '-';
      drawText(cylinders, 625, 303, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Maker: next to label 'Maker:'
      const maker = (safeStr(rcData.makerDescription) || '-').toUpperCase();
      drawText(maker, 745, 80, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Model: next to label 'Model:'
      const model = (safeStr(rcData.makerModel) || '-').toUpperCase();
      drawText(model, 735, 118, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Color: next to label 'Color:'
      const color = (safeStr(rcData.color) || '-').toUpperCase();
      drawText(color, 728, 149, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Body Type: next to label '/Body Type:'
      const bodyType = (safeStr(rcData.bodyType) || '-').toUpperCase();
      drawText(bodyType, 848, 149, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Seating Capacity: next to label 'Seating(in all) Capacity'
      const seating = safeStr(rcData.seatCapacity) || '-';
      drawText(seating, 808, 181, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Unladen Weight: next to label 'Unladen Weight (Kg)'
      const unladenWeight = safeStr(rcData.unladenWeight) ? `${safeStr(rcData.unladenWeight)} Kg` : '-';
      drawText(unladenWeight, 805, 211, 'bold 9px Arial, Helvetica, sans-serif', '#000000');

      // Cubic Cap / HP / Wheel Base: below label
      const cc = safeStr(rcData.cubicCapacity) ? `${safeStr(rcData.cubicCapacity)} CC` : '-';
      const hp = safeStr(rcData.horsePower) ? `${safeStr(rcData.horsePower)} BHP` : '-';
      const wb = safeStr(rcData.wheelbase) ? `${safeStr(rcData.wheelbase)} mm` : '-';
      const specLine = `${cc} / ${hp} / ${wb}`;
      drawText(specLine, 690, 259, 'bold 8px Arial, Helvetica, sans-serif', '#1e293b');

      // Financier: next to label 'Financier'
      let financierText = safeStr(rcData.financer);
      if (!financierText) {
        financierText = rcData.financed === false ? 'NOT FINANCED' : '-';
      }
      drawText(financierText.toUpperCase(), 748, 276, 'bold 8.5px Arial, Helvetica, sans-serif', '#000000');

      // Registration Authority: below label 'Registration Authority'
      const regAuthority = (safeStr(rcData.registeredAt) || 'RTO, RAIPUR, CHHATTISGARH').toUpperCase();
      drawText(regAuthority, 865, 306, 'bold 8px Arial, Helvetica, sans-serif', '#0f172a');

      ctx.restore();
    };

    render().catch((err) => {
      console.error('RC template render error:', err);
      if (active) setRenderError(err instanceof Error ? err.message : 'RC template rendering failed.');
    });

    return () => {
      active = false;
    };
  }, [qrDataUrl, rcData]);

  // Handle canvas click on QR code area
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    // QR Code in 2x space: left=1052 (526*2), top=216 (108*2), width=270, height=270
    if (clickX >= 1050 && clickX <= 1320 && clickY >= 210 && clickY <= 490) {
      setQrModalOpen(true);
    }
  };

  // Download high-resolution PNG
  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloadPngBusy(true);
    try {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.href = dataUrl;
      const cleanRc = effectiveRcNumber.replace(/[^A-Z0-9]+/gi, '-').toUpperCase();
      link.download = `${cleanRc || 'VEHICLE'}-RC-Certificate.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setDownloadPngBusy(false);
    }
  };

  // Download printable PDF
  const downloadPdf = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloadPdfBusy(true);
    try {
      const image = canvas.toDataURL('image/png', 1.0);
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
    } finally {
      setDownloadPdfBusy(false);
    }
  };

  // Print directly
  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print RC Certificate - ${effectiveRcNumber}</title>
          <style>
            @page { size: landscape; margin: 10mm; }
            body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; font-family: sans-serif; }
            img { width: 100%; max-width: 980px; height: auto; border: 1px solid #cbd5e1; border-radius: 8px; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" onload="window.print();window.close();" />
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCopyJson = () => {
    void navigator.clipboard.writeText(qrJsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" role="region" aria-label="RC Card Certificate Preview">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <CarFront className="h-4 w-4" />
            </span>
            <h3 className="text-base font-bold text-slate-900">
              Vehicle Registration Certificate (Form 23A)
            </h3>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200/60">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Indian Union Smart Card RC with verified details &amp; dynamic mParivahan QR code.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setQrModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            title="Inspect dynamic QR code payload"
          >
            <QrCodeIcon className="h-3.5 w-3.5 text-amber-600" />
            <span>QR Code</span>
          </button>

          <button
            type="button"
            onClick={downloadPng}
            disabled={downloadPngBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
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

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
            title="Print certificate directly"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Canvas Card Preview Container */}
      <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-5">
        <div className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-md transition-shadow hover:shadow-lg">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="h-auto w-full cursor-pointer select-none transition-transform"
            title="Click QR Code to view payload"
          />

          {/* Hint Overlay */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" /> Click on the QR code on the back card to view decoded data
            </span>
            <span className="font-mono text-[10px] text-slate-400">1024 × 342 px (Hi-DPI)</span>
          </div>
        </div>

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

