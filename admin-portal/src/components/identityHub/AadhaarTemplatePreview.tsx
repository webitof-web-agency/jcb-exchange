'use client';

import NextImage from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';
import QRCode from 'qrcode';

/**
 * AadhaarTemplatePreview
 *
 * Renders the official UIDAI Aadhaar blank letter template (1785 × 2526 px)
 * and dynamically overlays DigiLocker verified data onto an HTML5 Canvas.
 * Generates pixel-perfect PNG and A4 PDF downloads.
 */

const TEMPLATE_ASSET = '/templates/aadhaar/aadhaar-blank-template.png';
const CANVAS_WIDTH = 1785;
const CANVAS_HEIGHT = 2526;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Pixel-accurate field positions on the 1785 × 2526 base template
const FIELD = {
  // Top letter address block
  toName:      { x: 224, y: 876,  maxWidth: 560 },
  careOf:      { x: 285, y: 916,  maxWidth: 500 },
  hNo:         { x: 295, y: 942,  maxWidth: 490 },
  street:      { x: 224, y: 980,  maxWidth: 560 },
  vtc:         { x: 285, y: 1052, maxWidth: 500 },
  po:          { x: 275, y: 1078, maxWidth: 510 },
  subDistrict: { x: 350, y: 1106, maxWidth: 435 },
  district:    { x: 310, y: 1134, maxWidth: 475 },
  state:       { x: 295, y: 1162, maxWidth: 490 },
  pinCode:     { x: 335, y: 1190, maxWidth: 450 },
  mobile:      { x: 305, y: 1218, maxWidth: 480 },

  // Top letter QR & Aadhaar number
  letterQr:    { x: 520, y: 1260, size: 210 },
  topAadhaar:  { x: 465, y: 1610 },
  topVid:      { x: 415, y: 1640 },

  // Bottom left card (Front)
  photo:       { x: 180, y: 1815, width: 155, height: 190 },
  cardName:    { x: 435, y: 1834, maxWidth: 350 },
  cardDob:     { x: 500, y: 1878, maxWidth: 285 },
  cardGender:  { x: 465, y: 1902, maxWidth: 320 },
  cardAadhaar: { x: 470, y: 2135 },

  // Bottom right card (Back)
  backCareOf:  { x: 980, y: 1936, maxWidth: 190 },
  backHNo:     { x: 1235, y: 1936, maxWidth: 85 },
  backPo:      { x: 1030, y: 1974, maxWidth: 170 },
  backDist:    { x: 1260, y: 1974, maxWidth: 65 },
  backStatePin:{ x: 930, y: 2010, maxWidth: 350 },
  backQr:      { x: 1340, y: 1800, size: 280 },
  backVid:     { x: 1360, y: 2162 },
} as const;

function formatAadhaarDate(raw?: string | null): string {
  if (!raw) return '';
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
    const [y, m, d] = s.split('/');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    return s.replace(/-/g, '/');
  }
  return s;
}

function formatAadhaarDisplay(masked?: string | null): string {
  if (!masked) return '';
  const digits = masked.replace(/[^X0-9*]/g, '');
  if (digits.length === 12) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  return masked;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth) reject(new Error('Image could not be decoded.'));
      else resolve(img);
    };
    img.onerror = () => reject(new Error('Image could not be decoded.'));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });

const drawCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
) => {
  const sr = img.naturalWidth / img.naturalHeight;
  const tr = w / h;
  let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
  if (sr > tr) { sw = img.naturalHeight * tr; sx = (img.naturalWidth - sw) / 2; }
  else          { sh = img.naturalWidth / tr;  sy = (img.naturalHeight - sh) / 2; }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
};

const fitAndDraw = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number,
  startSize = 22,
  minSize = 14,
  fontFace = 'Arial, sans-serif',
  weight = 'bold',
) => {
  if (!text) return;
  let sz = startSize;
  ctx.font = `${weight} ${sz}px ${fontFace}`;
  while (sz > minSize && ctx.measureText(text).width > maxWidth) {
    sz -= 1;
    ctx.font = `${weight} ${sz}px ${fontFace}`;
  }
  ctx.fillText(text, x, y);
};

export type AadhaarData = {
  fullName?: string | null;
  fatherName?: string | null;
  careOf?: string | null;
  maskedAadhaar?: string | null;
  dob?: string | null;
  gender?: string | null;
  mobileNumber?: string | null;
  profileImage?: string | null;
  address?: {
    country?: string | null;
    district?: string | null;
    state?: string | null;
    postOffice?: string | null;
    house?: string | null;
    locality?: string | null;
    vtc?: string | null;
    subDistrict?: string | null;
    street?: string | null;
    landmark?: string | null;
    pincode?: string | null;
  } | null;
};

type Props = {
  data: AadhaarData;
};

const safe = (v?: string | null) => (v ?? '').trim();

export default function AadhaarTemplatePreview({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string | null>(null);
  const [downloadPdfBusy, setDownloadPdfBusy] = useState(false);
  const [downloadPngBusy, setDownloadPngBusy] = useState(false);
  const [error, setError] = useState('');

  const fullName      = safe(data.fullName).toUpperCase();
  const maskedAadhaar = formatAadhaarDisplay(data.maskedAadhaar);
  const dob           = formatAadhaarDate(data.dob);
  const gender        = safe(data.gender).toUpperCase();
  const mobile        = safe(data.mobileNumber);
  const effectivePhoto = customPhotoUrl || safe(data.profileImage);

  const addr        = data.address ?? {};
  const careOf      = safe(data.careOf) || safe(data.fatherName) || safe(addr.house);
  const hNo         = safe(addr.house);
  const streetLoc   = [safe(addr.street), safe(addr.locality), safe(addr.landmark)].filter(Boolean).join(', ');
  const vtc         = safe(addr.vtc);
  const po          = safe(addr.postOffice);
  const subDist     = safe(addr.subDistrict);
  const district    = safe(addr.district);
  const state       = safe(addr.state);
  const pinCode     = safe(addr.pincode);

  // QR string encoded with verified Aadhaar data
  const qrText = [
    'UIDAI - Government of India',
    maskedAadhaar ? `Aadhaar: ${maskedAadhaar}` : '',
    fullName      ? `Name: ${fullName}` : '',
    dob           ? `DOB: ${dob}` : '',
    gender        ? `Gender: ${gender}` : '',
    careOf        ? `C/O: ${careOf}` : '',
    district      ? `District: ${district}` : '',
    state         ? `State: ${state}` : '',
    pinCode       ? `PIN: ${pinCode}` : '',
    mobile        ? `Mobile: ${mobile}` : '',
  ].filter(Boolean).join('\n');

  // Handle optional custom photo selection
  const handlePhotoUpload = (file?: File | null) => {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError('Please upload a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Photo size exceeds 2 MB limit.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Render canvas whenever data or photo changes ──────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;

    const render = async () => {
      let letterQrUrl = '';
      let cardQrUrl = '';
      try {
        letterQrUrl = await QRCode.toDataURL(qrText || 'UIDAI Aadhaar', {
          margin: 1, width: 210, errorCorrectionLevel: 'M',
        });
        cardQrUrl = await QRCode.toDataURL(qrText || 'UIDAI Aadhaar', {
          margin: 1, width: 280, errorCorrectionLevel: 'M',
        });
      } catch { /* QR codes are optional */ }

      let baseImg: HTMLImageElement;
      try {
        baseImg = await loadImage(TEMPLATE_ASSET);
      } catch {
        if (active) setError('Aadhaar template image could not be loaded.');
        return;
      }
      if (!active) return;

      let photoEl: HTMLImageElement | null = null;
      if (effectivePhoto) {
        try { photoEl = await loadImage(effectivePhoto); } catch { /* skip */ }
      }
      if (!active) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width  = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      // 1. Draw base blank template
      ctx.drawImage(baseImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 2. Draw Top Letter Address Block
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // Name under "To"
      if (fullName) {
        fitAndDraw(ctx, fullName, FIELD.toName.x, FIELD.toName.y, FIELD.toName.maxWidth, 24, 16);
      }
      // C/O
      if (careOf) {
        fitAndDraw(ctx, careOf, FIELD.careOf.x, FIELD.careOf.y, FIELD.careOf.maxWidth, 20, 14);
      }
      // H No
      if (hNo) {
        fitAndDraw(ctx, hNo, FIELD.hNo.x, FIELD.hNo.y, FIELD.hNo.maxWidth, 20, 14);
      }
      // Street / Locality / Landmark
      if (streetLoc) {
        fitAndDraw(ctx, streetLoc, FIELD.street.x, FIELD.street.y, FIELD.street.maxWidth, 20, 14);
      }
      // VTC
      if (vtc) {
        fitAndDraw(ctx, vtc, FIELD.vtc.x, FIELD.vtc.y, FIELD.vtc.maxWidth, 20, 14);
      }
      // PO
      if (po) {
        fitAndDraw(ctx, po, FIELD.po.x, FIELD.po.y, FIELD.po.maxWidth, 20, 14);
      }
      // Sub District
      if (subDist) {
        fitAndDraw(ctx, subDist, FIELD.subDistrict.x, FIELD.subDistrict.y, FIELD.subDistrict.maxWidth, 20, 14);
      }
      // District
      if (district) {
        fitAndDraw(ctx, district, FIELD.district.x, FIELD.district.y, FIELD.district.maxWidth, 20, 14);
      }
      // State
      if (state) {
        fitAndDraw(ctx, state, FIELD.state.x, FIELD.state.y, FIELD.state.maxWidth, 20, 14);
      }
      // PIN Code
      if (pinCode) {
        fitAndDraw(ctx, pinCode, FIELD.pinCode.x, FIELD.pinCode.y, FIELD.pinCode.maxWidth, 20, 14);
      }
      // Mobile
      if (mobile) {
        fitAndDraw(ctx, mobile, FIELD.mobile.x, FIELD.mobile.y, FIELD.mobile.maxWidth, 20, 14);
      }

      // 3. Draw Letter QR Code
      if (letterQrUrl) {
        const qrImg = await loadImage(letterQrUrl).catch(() => null);
        if (qrImg && active) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(FIELD.letterQr.x, FIELD.letterQr.y, FIELD.letterQr.size, FIELD.letterQr.size);
          ctx.drawImage(qrImg, FIELD.letterQr.x, FIELD.letterQr.y, FIELD.letterQr.size, FIELD.letterQr.size);
        }
      }

      // 4. Draw Large Aadhaar Number on Top Letter
      if (maskedAadhaar) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 38px "Arial Black", Arial, sans-serif';
        ctx.letterSpacing = '5px';
        ctx.fillText(maskedAadhaar, FIELD.topAadhaar.x, FIELD.topAadhaar.y);
        ctx.letterSpacing = '0px';
      }

      // 5. Draw Bottom Left Card (Front of Card)
      // Profile Photo
      if (photoEl) {
        drawCover(ctx, photoEl, FIELD.photo.x, FIELD.photo.y, FIELD.photo.width, FIELD.photo.height);
      }

      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';

      // Name next to "Name:"
      if (fullName) {
        fitAndDraw(ctx, fullName, FIELD.cardName.x, FIELD.cardName.y, FIELD.cardName.maxWidth, 22, 16);
      }
      // DOB next to "DOB:"
      if (dob) {
        fitAndDraw(ctx, dob, FIELD.cardDob.x, FIELD.cardDob.y, FIELD.cardDob.maxWidth, 20, 15);
      }
      // Gender next to "Gender:"
      if (gender) {
        fitAndDraw(ctx, gender, FIELD.cardGender.x, FIELD.cardGender.y, FIELD.cardGender.maxWidth, 20, 15);
      }

      // Card Aadhaar Number (Large bold centered above "मेरा आधार, मेरी पहचान")
      if (maskedAadhaar) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 38px "Arial Black", Arial, sans-serif';
        ctx.letterSpacing = '5px';
        ctx.fillText(maskedAadhaar, FIELD.cardAadhaar.x, FIELD.cardAadhaar.y);
        ctx.letterSpacing = '0px';
      }

      // 6. Draw Bottom Right Card (Back of Card)
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';

      // C/O & H No
      if (careOf) {
        fitAndDraw(ctx, careOf, FIELD.backCareOf.x, FIELD.backCareOf.y, FIELD.backCareOf.maxWidth, 18, 13);
      }
      if (hNo) {
        fitAndDraw(ctx, hNo, FIELD.backHNo.x, FIELD.backHNo.y, FIELD.backHNo.maxWidth, 18, 13);
      }
      // PO & District
      if (po) {
        fitAndDraw(ctx, po, FIELD.backPo.x, FIELD.backPo.y, FIELD.backPo.maxWidth, 18, 13);
      }
      if (district) {
        fitAndDraw(ctx, district, FIELD.backDist.x, FIELD.backDist.y, FIELD.backDist.maxWidth, 18, 13);
      }
      // State & PIN
      const statePin = [state, pinCode].filter(Boolean).join(' - ');
      if (statePin) {
        fitAndDraw(ctx, statePin, FIELD.backStatePin.x, FIELD.backStatePin.y, FIELD.backStatePin.maxWidth, 18, 13);
      }

      // Back Card Large QR Code
      if (cardQrUrl) {
        const qrCardImg = await loadImage(cardQrUrl).catch(() => null);
        if (qrCardImg && active) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(FIELD.backQr.x, FIELD.backQr.y, FIELD.backQr.size, FIELD.backQr.size);
          ctx.drawImage(qrCardImg, FIELD.backQr.x, FIELD.backQr.y, FIELD.backQr.size, FIELD.backQr.size);
        }
      }
    };

    render().catch(() => {
      if (active) setError('Aadhaar template could not be rendered.');
    });

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, maskedAadhaar, dob, gender, mobile, effectivePhoto, qrText,
      careOf, hNo, streetLoc, vtc, po, subDist, district, state, pinCode]);

  // ── Download actions ─────────────────────────────────────────────────────
  const getCanvasBlob = () =>
    new Promise<Blob>((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas || canvas.width !== CANVAS_WIDTH) {
        reject(new Error('Aadhaar template is still preparing. Please wait a moment.'));
        return;
      }
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Aadhaar template PNG could not be prepared.'));
      }, 'image/png');
    });

  const downloadPng = async () => {
    setDownloadPngBusy(true);
    setError('');
    try {
      const blob = await getCanvasBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (fullName || 'aadhaar').replace(/[^A-Z0-9]/gi, '-').slice(0, 30);
      a.href = url;
      a.download = `aadhaar-${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PNG download failed.');
    } finally {
      setDownloadPngBusy(false);
    }
  };

  const downloadPdf = async () => {
    setDownloadPdfBusy(true);
    setError('');
    try {
      const blob = await getCanvasBlob();
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === 'string' ? res(reader.result) : rej(new Error('Read error')));
        reader.onerror = () => rej(new Error('Read error'));
        reader.readAsDataURL(blob);
      });
      const { pdf } = await import('@react-pdf/renderer');
      const { AadhaarTemplatePdfDocument } = await import('./AadhaarTemplatePdfDocument');
      const pdfBlob = await pdf(<AadhaarTemplatePdfDocument image={dataUrl} />).toBlob();
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      const safeName = (fullName || 'aadhaar').replace(/[^A-Z0-9]/gi, '-').slice(0, 30);
      a.href = url;
      a.download = `aadhaar-${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF download failed.');
    } finally {
      setDownloadPdfBusy(false);
    }
  };

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-linear-to-b from-slate-50 to-slate-100/60 p-4 shadow-xs sm:p-5"
      aria-live="polite"
    >
      {/* Header with Title and Download Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3.5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Aadhaar Card Template</h3>
          <p className="mt-1 text-xs text-slate-500">Official UIDAI layout with dynamic DigiLocker data</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> DigiLocker verified
          </span>
          <button
            type="button"
            id="aadhaar-template-download-png"
            onClick={downloadPng}
            disabled={downloadPngBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadPngBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-slate-600" />}
            {downloadPngBusy ? 'Preparing PNG...' : 'Download PNG'}
          </button>
          <button
            type="button"
            id="aadhaar-template-download-pdf"
            onClick={downloadPdf}
            disabled={downloadPdfBusy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadPdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloadPdfBusy ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Optional Photo Control */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3">
        <div>
          <p className="text-xs font-bold text-slate-800">Card Photo (Optional Override)</p>
          <p className="text-[11px] text-slate-500">
            {effectivePhoto ? 'Photo loaded from DigiLocker. You can upload an alternate photo if needed.' : 'Upload a passport photo to display on the card (max 2 MB).'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {customPhotoUrl ? (
            <button
              type="button"
              onClick={() => setCustomPhotoUrl(null)}
              className="text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Reset to original
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Upload className="h-3.5 w-3.5" />
            {customPhotoUrl ? 'Change Photo' : 'Upload Photo'}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
          />
        </div>
      </div>

      {/* Canvas preview */}
      <div className="mt-4 flex items-center justify-center overflow-x-auto py-2">
        <div className="relative max-w-full overflow-hidden rounded-[14px] shadow-[0_12px_30px_-5px_rgba(15,23,42,0.30)]">
          <canvas
            ref={canvasRef}
            className="block h-auto w-[460px] max-w-full select-none"
            aria-label="Generated Aadhaar template"
          />
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] text-slate-400">
        Template generated directly from verified DigiLocker data · For reference & official KYC verification only
      </p>
    </section>
  );
}
