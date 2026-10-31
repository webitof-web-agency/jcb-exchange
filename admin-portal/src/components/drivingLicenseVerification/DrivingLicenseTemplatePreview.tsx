/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  FileDown,
  FileText,
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
import type { DrivingLicenseResultResponse } from '@/lib/drivingLicenseVerification';

// Keep these filenames explicit so the front/back artwork cannot silently fall
// back to an older cached or generic template after a deployment.
const FRONT_TEMPLATE_SRC = '/templates/dl/dl-front-blank-template.png?v=2';
const BACK_TEMPLATE_SRC = '/templates/dl/dl-back-blank-template.png?v=2';
const CAR_ICON_SRC = '/templates/dl/car-icon.png';
const BIKE_ICON_SRC = '/templates/dl/bike-icon.png';
const BASE_WIDTH = 1024;
const BASE_HEIGHT_FRONT = 651;
const BASE_HEIGHT_BACK = 636;
const CANVAS_WIDTH = 2048;
const CANVAS_HEIGHT_FRONT = 1302;
const CANVAS_HEIGHT_BACK = 1272;
const OUTPUT_SCALE = 2;
const KEY_FONT = '750 11.5px Arial, Helvetica, sans-serif';
const COMPACT_KEY_FONT = '750 19px Arial, Helvetica, sans-serif';
const VALUE_FONT = '700 16px Arial, Helvetica, sans-serif';
const SMALL_VALUE_FONT = '700 16px Arial, Helvetica, sans-serif';
const TABLE_HEADER_FONT = '750 13px Arial, Helvetica, sans-serif';
const TABLE_DATA_FONT = '750 16px Arial, Helvetica, sans-serif';
const HEADER_DL_FONT = '750 23px Arial, Helvetica, sans-serif';
const FRONT_DL_NO_FONT = '750 26px Arial, Helvetica, sans-serif';
const FRONT_KEY_FONT = '500 17px Arial, Helvetica, sans-serif';
const FRONT_VAL_FONT = '750 17.5px Arial, Helvetica, sans-serif';
const FRONT_DETAIL_KEY_FONT = '500 16.5px Arial, Helvetica, sans-serif';
const FRONT_DETAIL_VAL_FONT = '750 17px Arial, Helvetica, sans-serif';
const FRONT_ADDR_FONT = '700 16px Arial, Helvetica, sans-serif';
const FRONT_VERTICAL_FONT = '750 14px Arial, Helvetica, sans-serif';
const TEMPLATE_REQUEST_TIMEOUT_MS = 30_000;

type Props = {
  response: DrivingLicenseResultResponse;
  onUploaded?: (response: DrivingLicenseResultResponse) => void;
};

type DrawContext = CanvasRenderingContext2D;

const safeString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text === 'null' || text === 'undefined' ? '' : text;
  }
  return '';
};

const stringValue = (...values: unknown[]) => {
  for (const value of values) {
    const text = safeString(value);
    if (text) return text;
  }
  return '';
};

const listValue = (value: unknown): string[] => {
  if (!Array.isArray(value)) return stringValue(value) ? [stringValue(value)] : [];
  return value.map((item) => {
    if (typeof item === 'object' && item !== null) return JSON.stringify(item);
    return safeString(item);
  }).filter(Boolean);
};

const formatDate = (value: unknown) => {
  const raw = safeString(value);
  if (!raw) return '';
  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(raw)) return raw.replaceAll('/', '-');
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split('-');
    return `${day}-${month}-${year}`;
  }
  return raw;
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

const safeFilePart = (value: string) => value.replace(/[^A-Z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toUpperCase() || 'CARD';

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The template image could not be read.'));
  reader.onerror = () => reject(new Error('The template image could not be read.'));
  reader.readAsDataURL(blob);
});

const createRoundedRectPath = (ctx: DrawContext, x: number, y: number, width: number, height: number, radius: number) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
};

const drawText = (
  ctx: DrawContext,
  text: string,
  x: number,
  y: number,
  font: string,
  maxWidth?: number,
  align: CanvasTextAlign = 'left',
) => {
  if (!text) return;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = '#000000';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
};

const drawKeyValue = (
  ctx: DrawContext,
  key: string,
  value: string,
  x: number,
  y: number,
  options: { valueOffset?: number; keyFont?: string; valueFont?: string; maxWidth?: number } = {},
) => {
  drawText(ctx, key, x, y, options.keyFont || KEY_FONT, options.maxWidth);
  drawText(ctx, value || '-', x, y + (options.valueOffset || 12), options.valueFont || VALUE_FONT, options.maxWidth);
};

const wrapText = (ctx: DrawContext, text: string, maxWidth: number, maxLines = 2) => {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
};

const drawBadge = (ctx: DrawContext, text: string, cx: number, cy: number, color: string) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 12.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.font = '700 10px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.3);
  ctx.restore();
};

const loadImage = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const image = new window.Image();
  if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});

const normalizeProfileImageSource = (...values: unknown[]) => {
  const source = stringValue(...values);
  if (!source) return '';
  if (/^data:image\//i.test(source)) return source;
  if (/^[A-Za-z0-9+/=_-]+$/.test(source)) return `data:image/jpeg;base64,${source}`;
  return source;
};

const drawVerticalText = (ctx: DrawContext, text: string, x: number, y: number, font = '700 7px Arial, Helvetica, sans-serif') => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  drawText(ctx, text, 0, 0, font);
  ctx.restore();
};

export default function DrivingLicenseTemplatePreview({ response, onUploaded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadedRef = useRef(false);
  const lastRecordIdRef = useRef(response.record.id);
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [remaining, setRemaining] = useState(() => response.record.rawDataExpiresAt ? new Date(response.record.rawDataExpiresAt).getTime() - Date.now() : 0);
  const [templateBlob, setTemplateBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dynamicResult, setDynamicResult] = useState(() => response.result);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [downloadPngBusy, setDownloadPngBusy] = useState(false);
  const [downloadPdfBusy, setDownloadPdfBusy] = useState(false);
  const [error, setError] = useState('');
  const [renderError, setRenderError] = useState('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const template = response.template ?? response.record.template ?? null;
  const result = useMemo(() => dynamicResult || response.result || {}, [dynamicResult, response.result]);
  const maskedLicense = response.record.maskedLicenseNumber || 'LICENSE';
  const hasResult = response.record.status === 'SUCCESS' && Boolean(dynamicResult || response.result);
  const effectiveLicense = stringValue(result.licenseNumber, maskedLicense);
  const qrObject = useMemo(() => ({
    dl_number: effectiveLicense.replace(/\s+/g, ''),
    name: stringValue(result.name) || undefined,
    dob: formatDate(result.dob) || undefined,
    issue_date: formatDate(result.issueDate) || undefined,
    expiry_date: formatDate(result.expiryDate) || undefined,
    state: stringValue(result.state) || undefined,
    vehicle_classes: listValue(result.vehicleClasses),
  }), [effectiveLicense, result]);
  const qrJsonText = useMemo(() => JSON.stringify(qrObject, null, 2), [qrObject]);
  const publicVerificationUrl = (response as DrivingLicenseResultResponse & { publicVerificationUrl?: string }).publicVerificationUrl;
  const qrPayload = publicVerificationUrl || qrJsonText;
  const expired = remaining <= 0;

  useEffect(() => {
    if (lastRecordIdRef.current === response.record.id) return;
    lastRecordIdRef.current = response.record.id;
    setDynamicResult(response.result);
    setTemplateBlob(null);
    setPreviewUrl('');
  }, [response.record.id, response.result]);

  useEffect(() => {
    if (template || !hasResult || uploadedRef.current) return;
    const expiry = response.record.rawDataExpiresAt ? new Date(response.record.rawDataExpiresAt).getTime() : 0;
    const tick = () => setRemaining(expiry - Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hasResult, response.record.rawDataExpiresAt, template]);

  useEffect(() => {
    if (!template) return;
    let active = true;
    let objectUrl = '';
    getVerificationTemplateBlob(`driving-license-verification:${response.record.id}:${template.id}`, async () => {
      const result = await api.get<Blob>(`/driving-license-verification/${response.record.id}/template`, { responseType: 'blob', timeout: TEMPLATE_REQUEST_TIMEOUT_MS });
      return result.data;
    })
      .then((blob) => {
        if (!active) return;
        setTemplateBlob(blob);
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError('Saved driving-license template could not be loaded.');
      });
    return () => {
      active = false;
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    };
  }, [response.record.id, template]);

  useEffect(() => {
    if (!hasResult) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let active = true;

    const render = async () => {
      setRenderError('');
      const isFront = activeSide === 'front';
      const baseHeight = isFront ? BASE_HEIGHT_FRONT : BASE_HEIGHT_BACK;
      const canvasHeight = isFront ? CANVAS_HEIGHT_FRONT : CANVAS_HEIGHT_BACK;

      canvas.width = CANVAS_WIDTH;
      canvas.height = canvasHeight;
      ctx.clearRect(0, 0, CANVAS_WIDTH, canvasHeight);

      if (isFront) {
        const profileImageSource = normalizeProfileImageSource(result.profileImage, result.profile_image, result.photoUrl, result.photo);
        const [templateImg, profileImg] = await Promise.all([
          loadImage(FRONT_TEMPLATE_SRC),
          profileImageSource ? loadImage(profileImageSource) : Promise.resolve(null),
        ]);
        if (!active) return;

        ctx.save();
        ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE);

        // 1. Draw front blank template
        if (templateImg) {
          ctx.drawImage(templateImg, 0, 0, BASE_WIDTH, baseHeight);
        }

        // 2. DL Number right after header notch
        drawText(ctx, effectiveLicense, 198, 185, FRONT_DL_NO_FONT);

        // 3. Validity Row 1: Keys
        drawText(ctx, 'Issue Date', 212, 230, FRONT_KEY_FONT);
        drawText(ctx, 'Validity ( NT )', 415, 230, FRONT_KEY_FONT);
        drawText(ctx, 'Validity ( TR )', 640, 230, FRONT_KEY_FONT);

        // 4. Validity Row 2: Values
        const issueDate = formatDate(result.issueDate || result.originalIssueDate);
        drawText(ctx, issueDate || '-', 212, 260, FRONT_VAL_FONT);
        const expiryDate = formatDate(result.expiryDate);
        drawText(ctx, expiryDate || '-', 415, 260, FRONT_VAL_FONT);
        const transportExpiry = formatDate(result.transportExpiryDate);
        drawText(ctx, transportExpiry || '-', 640, 260, FRONT_VAL_FONT);

        // 5. Photo
        if (profileImg) {
          ctx.drawImage(profileImg, 837, 145, 136, 210);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(837, 145, 136, 210);
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.strokeRect(837, 145, 136, 210);
        }

        // 6. Name
        drawText(ctx, 'Name', 52, 408, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, ':', 202, 408, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, stringValue(result.name).toUpperCase() || '-', 218, 408, FRONT_DETAIL_VAL_FONT, 560);

        // 7. Holder's Signature Label
        drawText(ctx, "Holder's Signature", 805, 408, FRONT_KEY_FONT);

        // 8. Date Of Birth, Blood Group, Organ Donor
        drawText(ctx, 'Date Of Birth', 52, 448, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, ':', 202, 448, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, formatDate(result.dob) || '-', 218, 448, FRONT_DETAIL_VAL_FONT);

        drawText(ctx, 'Blood Group:', 375, 448, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, stringValue(result.bloodGroup).toUpperCase() || '-', 495, 448, FRONT_DETAIL_VAL_FONT, 80);

        drawText(ctx, 'Organ Donor:', 600, 448, FRONT_DETAIL_KEY_FONT);
        const organDonor = stringValue(result.organDonor, result.organ_donor);
        if (organDonor) {
          drawText(ctx, organDonor.toUpperCase(), 720, 448, FRONT_DETAIL_VAL_FONT, 180);
        }

        // 9. Son/Daughter/Wife of
        drawText(ctx, 'Son/Daughter/Wife of', 52, 488, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, ':', 294, 488, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, stringValue(result.fatherOrHusbandName).toUpperCase() || '-', 310, 488, FRONT_DETAIL_VAL_FONT, 660);

        // 10. Address (Wrapped in 2 lines)
        const address = stringValue(result.permanentAddress, result.temporaryAddress).toUpperCase();
        ctx.save();
        ctx.font = FRONT_ADDR_FONT;
        const addressLines = wrapText(ctx, address, 800, 2);
        ctx.restore();

        drawText(ctx, 'Address', 52, 528, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, ':', 148, 528, FRONT_DETAIL_KEY_FONT);
        drawText(ctx, addressLines[0] || '-', 168, 528, FRONT_ADDR_FONT, 800);
        if (addressLines[1]) {
          drawText(ctx, addressLines[1], 168, 564, FRONT_ADDR_FONT, 800);
        }

        // 11. Vertical text on right edge: Date of First Issue
        const firstIssue = formatDate(result.originalIssueDate || result.issueDate);
        drawVerticalText(ctx, `Date of First Issue ${firstIssue}`, 1002, 500, FRONT_VERTICAL_FONT);

        ctx.restore();
      } else {
        // BACK CARD
        const [templateImg, carIcon, bikeIcon, qrDataUrl] = await Promise.all([
          loadImage(BACK_TEMPLATE_SRC),
          loadImage(CAR_ICON_SRC),
          loadImage(BIKE_ICON_SRC),
          QRCode.toDataURL(qrPayload, {
            margin: 0,
            width: 348,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' },
          }),
        ]);
        if (!active) return;
        const qrImage = await loadImage(qrDataUrl);
        if (!active) return;

        ctx.save();
        ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE);

        // 1. Draw blank back template
        if (templateImg) {
          ctx.drawImage(templateImg, 0, 0, BASE_WIDTH, baseHeight);
        }

        // 2. DL Number in top blue header
        drawText(ctx, effectiveLicense, 172, 65, HEADER_DL_FONT);

        // 3. QR Code inside the pre-printed white box
        if (qrImage) {
          ctx.drawImage(qrImage, 70, 98, 174, 174);
        }

        // 4. ADPVEH No.(Regn.Numbers)
        drawText(ctx, 'ADPVEH No.(Regn.Numbers)', 300, 114, COMPACT_KEY_FONT);

        // 5. Hazardous validity & Hill Validity
        drawText(ctx, 'Hazardous validity', 300, 168, COMPACT_KEY_FONT);
        const hazVal = stringValue(result.hazardousValidity, result.hazardous_validity);
        if (hazVal) {
          drawText(ctx, hazVal, 300, 194, SMALL_VALUE_FONT);
        }
        drawText(ctx, 'Hill Validity', 702, 168, COMPACT_KEY_FONT);
        const hillVal = stringValue(result.hillValidity, result.hill_validity);
        if (hillVal) {
          drawText(ctx, hillVal, 702, 194, SMALL_VALUE_FONT);
        }

        // 6. Table Headers
        const colCenters = [125.5, 237, 348.5, 460, 572, 683.5, 795.5, 906];
        const tableHeaders = [
          ['Class of', 'Vehicle'],
          ['Code'],
          ['Issued by'],
          ['Date of', 'Issue'],
          ['Vehicle', 'Category'],
          ['Badge', 'Number'],
          ['Badge', 'Issued Date'],
          ['Badge', 'Issued by'],
        ];
        tableHeaders.forEach((lines, idx) => {
          const cx = colCenters[idx];
          if (lines.length === 1) {
            drawText(ctx, lines[0], cx, 325, TABLE_HEADER_FONT, undefined, 'center');
          } else {
            drawText(ctx, lines[0], cx, 315, TABLE_HEADER_FONT, undefined, 'center');
            drawText(ctx, lines[1], cx, 333, TABLE_HEADER_FONT, undefined, 'center');
          }
        });

        // 7. Table Data Rows
        const classes = listValue(result.vehicleClasses);
        const descriptions = listValue(result.vehicleClassDescriptions);
        const badges = listValue(result.badgeNumbers);
        const badgeIssuedDates = listValue(result.badgeIssuedDate);
        const badgeIssuedBys = listValue(result.badgeIssuedBy);

        const rowCenters = [360, 389, 418, 447, 476, 505];
        classes.forEach((vClass, idx) => {
          if (idx >= rowCenters.length) return;
          const rowMidY = rowCenters[idx];
          const baseline = rowMidY + 5;
          const upperClass = vClass.toUpperCase();

          // Col 0: Vehicle Icon
          const is2w = /MCWG|MCWOG|2WN|BIKE|SCOOTER|MOTORCYCLE/i.test(upperClass);
          const is4w = /LMV|CAR|4WN|MOTOR\s*CAR|HMV/i.test(upperClass);
          if (is4w && carIcon) {
            ctx.drawImage(carIcon, 125.5 - 20, rowMidY - 10, 40, 20);
          } else if (is2w && bikeIcon) {
            ctx.drawImage(bikeIcon, 125.5 - 18, rowMidY - 12, 36, 24);
          } else {
            drawText(ctx, vClass, 125.5, baseline, TABLE_DATA_FONT, 90, 'center');
          }

          // Col 1: Code
          drawText(ctx, vClass, 237, baseline, TABLE_DATA_FONT, 90, 'center');

          // Col 2: Issued by
          const issuedBy = stringValue(result.issuingAuthorityCode, result.state);
          drawText(ctx, issuedBy || '-', 348.5, baseline, TABLE_DATA_FONT, 90, 'center');

          // Col 3: Date of Issue
          const issueDt = formatDate(result.issueDate || result.originalIssueDate);
          drawText(ctx, issueDt || '-', 460, baseline, TABLE_DATA_FONT, 90, 'center');

          // Col 4: Vehicle Category
          const cat = descriptions[idx] || (is2w || is4w ? 'NT' : 'NT');
          drawText(ctx, cat, 572, baseline, TABLE_DATA_FONT, 90, 'center');

          // Col 5: Badge Number
          if (badges[idx]) {
            drawText(ctx, badges[idx], 683.5, baseline, TABLE_DATA_FONT, 90, 'center');
          }

          // Col 6: Badge Issued Date
          if (badgeIssuedDates[idx]) {
            drawText(ctx, formatDate(badgeIssuedDates[idx]), 795.5, baseline, TABLE_DATA_FONT, 90, 'center');
          }

          // Col 7: Badge Issued by
          if (badgeIssuedBys[idx]) {
            drawText(ctx, badgeIssuedBys[idx], 906, baseline, TABLE_DATA_FONT, 90, 'center');
          }
        });

        // 8. Below Table
        drawText(ctx, 'Mobile Number:', 48, 555, COMPACT_KEY_FONT);
        const mobVal = stringValue(result.mobileNumber, result.mobile_number);
        if (mobVal) {
          drawText(ctx, mobVal, 195, 555, SMALL_VALUE_FONT);
        }

        drawText(ctx, 'Licencing Authority', 840, 542, COMPACT_KEY_FONT, 200, 'center');
        drawText(ctx, stringValue(result.issuingAuthority).toUpperCase() || '-', 840, 566, COMPACT_KEY_FONT, 240, 'center');

        ctx.restore();
      }
    };

    render().catch((renderRequestError) => {
      if (active) setRenderError(renderRequestError instanceof Error ? renderRequestError.message : 'Driving-license template rendering failed.');
    });
    return () => { active = false; };
  }, [activeSide, effectiveLicense, hasResult, qrPayload, result, template]);

  const getSourceBlob = async () => {
    if (!hasResult && templateBlob) return templateBlob;
    if (!hasResult && template) {
      const blob = await getVerificationTemplateBlob(`driving-license-verification:${response.record.id}:${template.id}`, async () => {
        const result = await api.get<Blob>(`/driving-license-verification/${response.record.id}/template`, { responseType: 'blob', timeout: TEMPLATE_REQUEST_TIMEOUT_MS });
        return result.data;
      });
      setTemplateBlob(blob);
      return blob;
    }
    const canvas = canvasRef.current;
    if (!canvas || canvas.width !== CANVAS_WIDTH) throw new Error('The driving-license template is still preparing.');
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The driving-license template could not be prepared.');
    return blob;
  };

  const upload = async () => {
    if (!onUploaded || !hasResult || !response.record.id || expired) {
      setError('The five-minute template window has expired. Run driving-license verification again.');
      return;
    }
    setUploadBusy(true);
    setError('');
    try {
      const blob = await getSourceBlob();
      const formData = new FormData();
      formData.append('template', blob, `driving-license-${safeFilePart(effectiveLicense)}.png`);
      const uploadResponse = await api.post<DrivingLicenseResultResponse>(`/driving-license-verification/${response.record.id}/template`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const savedTemplate = uploadResponse.data.template ?? uploadResponse.data.record.template;
      uploadedRef.current = true;
          setRemaining(0);
          setTemplateBlob(blob);
          if (savedTemplate) primeVerificationTemplateBlob(`driving-license-verification:${uploadResponse.data.record.id}:${savedTemplate.id}`, blob);
          setDynamicResult(result);
          onUploaded({ ...uploadResponse.data, result: null, template: savedTemplate });
    } catch (uploadRequestError) {
      const message = uploadRequestError as { response?: { data?: { error?: unknown } }; message?: string };
      setError(typeof message.response?.data?.error === 'string' ? message.response.data.error : message.message || 'The driving-license template could not be uploaded.');
    } finally {
      setUploadBusy(false);
    }
  };

  const downloadPng = async () => {
    setDownloadPngBusy(true);
    setError('');
    try {
      const blob = await getSourceBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFilePart(effectiveLicense)}-Driving-License-${activeSide.toUpperCase()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'PNG download failed.');
    } finally {
      setDownloadPngBusy(false);
    }
  };

  const downloadPdf = async () => {
    setDownloadPdfBusy(true);
    setError('');
    try {
      const image = await blobToDataUrl(await getSourceBlob());
      const { pdf } = await import('@react-pdf/renderer');
      const { DrivingLicenseTemplatePdfDocument } = await import('./DrivingLicenseTemplatePdfDocument');
      const pdfBlob = await pdf(<DrivingLicenseTemplatePdfDocument image={image} licenseNumber={effectiveLicense} />).toBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFilePart(effectiveLicense)}-Driving-License.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'PDF download failed.');
    } finally {
      setDownloadPdfBusy(false);
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeSide !== 'back') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;
    // QR code is in box x: 58..256, y: 87..283 at BASE coords (scaled by OUTPUT_SCALE = 2)
    if (clickX >= 58 * OUTPUT_SCALE && clickX <= 256 * OUTPUT_SCALE && clickY >= 87 * OUTPUT_SCALE && clickY <= 283 * OUTPUT_SCALE) {
      setQrModalOpen(true);
    }
  };

  const copyQr = () => {
    void navigator.clipboard.writeText(qrJsonText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (!template && !hasResult) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" role="region" aria-label="Driving License Template Preview">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-inner">
                <button type="button" onClick={() => setActiveSide('front')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeSide === 'front' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Front Card</button>
                <button type="button" onClick={() => setActiveSide('back')} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeSide === 'back' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Back Card</button>
              </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><FileText className="h-4 w-4" /></span>
            <h3 className="text-base font-bold text-slate-900">Driving Licence Template</h3>
            {template ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Template saved {template.fileSize ? `(${formatFileSize(template.fileSize)})` : ''}</span> : <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${expired ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><ShieldCheck className="h-3.5 w-3.5" />{expired ? 'Upload window expired' : `Upload within ${formatRemaining(remaining)}`}</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">Dynamic front and back card generated from the verified API response.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void downloadPng()} disabled={downloadPngBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"><Download className="h-3.5 w-3.5" />{downloadPngBusy ? 'Preparing...' : 'PNG'}</button>
          <button type="button" onClick={() => void downloadPdf()} disabled={downloadPdfBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"><FileDown className="h-3.5 w-3.5 text-amber-700" />{downloadPdfBusy ? 'Preparing...' : 'PDF Card'}</button>
          {!template && onUploaded ? <button type="button" onClick={() => void upload()} disabled={uploadBusy || expired} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">{uploadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{uploadBusy ? 'Saving...' : 'Upload & Save Template'}</button> : null}
        </div>
      </div>
      {error ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}
          <div className="mt-5 flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-5">
            <div className="relative w-full max-w-5xl overflow-hidden rounded-none border border-slate-300 bg-white shadow-md">
              {template && !hasResult ? previewUrl ? <img src={previewUrl} alt={`Driving Licence - ${effectiveLicense}`} className="h-auto w-full select-none" /> : <div className="flex min-h-[260px] items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-amber-600" />Loading saved template...</div> : <canvas ref={canvasRef} onClick={handleCanvasClick} className="h-auto w-full cursor-pointer select-none" title="Click QR Code to view payload" aria-label="Generated driving licence template" />}
            </div>
      </div>
      {renderError ? <div className="mt-3 text-xs font-semibold text-rose-600">{renderError}</div> : null}
      {qrModalOpen ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><QrCodeIcon className="h-4 w-4 text-amber-600" />Driving Licence QR data</div><button type="button" onClick={() => setQrModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close QR data"><X className="h-4 w-4" /></button></div><div className="space-y-3 p-5"><div className="flex justify-end"><button type="button" onClick={copyQr} className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">{copied ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}{copied ? 'Copied' : 'Copy JSON'}</button></div><pre className="max-h-64 overflow-y-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-amber-300">{qrPayload}</pre></div></div></div> : null}
    </section>
  );
}
