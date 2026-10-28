'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import QRCode from 'qrcode';
import api from '@/lib/api';
import { getAadhaarApiError } from '@/lib/aadhaarDigiLocker.mjs';
import { getAadhaarTemplateBlob, rememberAadhaarTemplateBlob } from '@/lib/aadhaarTemplateCache';

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
// Pixel-accurate field positions on the 1785 × 2526 base template
const FIELD = {
  // Top letter address block
  enrolmentNo: { x: 540, y: 798,  maxWidth: 320 },
  toName:      { x: 224, y: 876,  maxWidth: 560 },
  careOf:      { x: 278, y: 917,  maxWidth: 500 },
  hNo:         { x: 280, y: 944,  maxWidth: 490 },
  streetLine1: { x: 224, y: 955,  maxWidth: 560 },
  streetLine2: { x: 224, y: 985,  maxWidth: 560 },
  vtc:         { x: 278, y: 1054, maxWidth: 500 },
  po:          { x: 270, y: 1082, maxWidth: 510 },
  subDistrict: { x: 345, y: 1109, maxWidth: 435 },
  district:    { x: 302, y: 1137, maxWidth: 475 },
  state:       { x: 286, y: 1164, maxWidth: 490 },
  pinCode:     { x: 328, y: 1192, maxWidth: 450 },
  mobile:      { x: 298, y: 1219, maxWidth: 480 },

  // Top letter QR & Aadhaar number
  letterQr:    { x: 520, y: 1260, size: 210 },
  topAadhaar:  { x: 460, y: 1606 },
  topVid:      { x: 405, y: 1642 },

  // Bottom left card (Front)
  photo:       { x: 175, y: 1815, width: 170, height: 210 },
  issueDate:   { x: 158, y: 1895 },
  cardName:    { x: 438, y: 1837, maxWidth: 350 },
  cardDob:     { x: 495, y: 1883, maxWidth: 285 },
  cardGender:  { x: 454, y: 1906, maxWidth: 320 },
  cardAadhaar: { x: 477, y: 2128 },

  // Bottom right card (Back)
  hindiCareOf: { x: 975, y: 1836, maxWidth: 355 },
  hindiStreet: { x: 930, y: 1862, maxWidth: 395 },
  hindiDist:   { x: 930, y: 1888, maxWidth: 395 },
  backWhiteout:{ x: 925, y: 1920, width: 405, height: 115 },
  backCareOf:  { x: 930, y: 1938, maxWidth: 395 },
  backStreet:  { x: 930, y: 1964, maxWidth: 395 },
  backPoDist:  { x: 930, y: 1990, maxWidth: 395 },
  backStatePin:{ x: 930, y: 2016, maxWidth: 395 },
  backQr:      { x: 1340, y: 1780, size: 280 },
  backBottomWhiteout: { x: 1050, y: 2075, width: 460, height: 105 },
  backAadhaar: { x: 1280, y: 2115 },
  backDottedLine: { x1: 1060, y: 2138, x2: 1500 },
  backVid:     { x: 1280, y: 2165 },
} as const;

// Transliteration Dictionary for Indian Addresses & Names
const HINDI_DICT: Record<string, string> = {
  's/o': 'आत्मज', 'd/o': 'आत्मजा', 'w/o': 'पत्नी', 'c/o': 'द्वारा',
  'h no': 'मकान नं.', 'house no': 'मकान नं.', 'flat no': 'फ्लैट नं.', 'plot no': 'प्लॉट नं.',
  'sector': 'सेक्टर', 'sectar': 'सेक्टर', 'sec': 'सेक्टर',
  'street': 'स्ट्रीट', 'road': 'रोड', 'colony': 'कॉलोनी',
  'professsor': 'प्रोफेसर', 'professor': 'प्रोफेसर',
  'nagar': 'नगर', 'vihar': 'विहार', 'enclave': 'एन्क्लेव',
  'gali': 'गली', 'lane': 'लेन', 'ward': 'वार्ड', 'mohalla': 'मोहल्ला',
  'village': 'ग्राम', 'post': 'डाक', 'po': 'डाक',
  'dist': 'जिला', 'district': 'जिला', 'tehsil': 'तहसील',
  'block': 'ब्लॉक', 'near': 'निकट', 'behind': 'पीछे', 'opposite': 'सामने',

  // States
  'andhra pradesh': 'आंध्र प्रदेश', 'arunachal pradesh': 'अरुणाचल प्रदेश',
  'assam': 'असम', 'bihar': 'बिहार', 'chhattisgarh': 'छत्तीसगढ़',
  'goa': 'गोवा', 'gujarat': 'गुजरात', 'haryana': 'हरियाणा',
  'himachal pradesh': 'हिमाचल प्रदेश', 'jharkhand': 'झारखंड',
  'karnataka': 'कर्नाटक', 'kerala': 'केरल', 'madhya pradesh': 'मध्य प्रदेश',
  'maharashtra': 'महाराष्ट्र', 'manipur': 'मणिपुर', 'meghalaya': 'मेघालय',
  'mizoram': 'मिजोरम', 'nagaland': 'नागालैंड', 'odisha': 'ओडिशा',
  'punjab': 'पंजाब', 'rajasthan': 'राजस्थान', 'sikkim': 'सिक्किम',
  'tamil nadu': 'तमिलनाडु', 'telangana': 'तेलंगाना', 'tripura': 'त्रिपुरा',
  'uttar pradesh': 'उत्तर प्रदेश', 'uttarakhand': 'उत्तराखंड',
  'west bengal': 'पश्चिम बंगाल', 'delhi': 'दिल्ली', 'new delhi': 'नई दिल्ली',
  'jammu and kashmir': 'जम्मू और कश्मीर', 'ladakh': 'लद्दाख', 'chandigarh': 'चंडीगढ़',

  // Common Cities / Districts
  'raipur': 'रायपुर', 'bilaspur': 'बिलासपुर', 'durg': 'दुर्ग', 'bhilai': 'भिलाई',
  'rajnandgaon': 'राजनंदगांव', 'korba': 'कोरबा', 'raigarh': 'रायगढ़', 'jagdalpur': 'जगदलपुर',
  'jaipur': 'जयपुर', 'jodhpur': 'जोधपुर', 'lucknow': 'लखनऊ', 'kanpur': 'कानपुर',
  'varanasi': 'वाराणसी', 'allahabad': 'प्रयागराज', 'prayagraj': 'प्रयागराज', 'noida': 'नोएडा',
  'gurugram': 'गुरुग्राम', 'gurgaon': 'गुरुग्राम', 'patna': 'पटना', 'ranchi': 'राँची',
  'mumbai': 'मुंबई', 'pune': 'पुणे', 'bhopal': 'भोपाल', 'indore': 'इंदौर',
  'kolkata': 'कोलकाता', 'ahmedabad': 'अहमदाबाद', 'bengaluru': 'बेंगलुरु', 'hyderabad': 'हैदराबाद',

  // Common Names & Surnames
  'meghraj': 'मेघराज', 'dewangan': 'देवांगन', 'daulat': 'दौलत', 'ram': 'राम',
  'kumar': 'कुमार', 'singh': 'सिंह', 'sharma': 'शर्मा', 'verma': 'वर्मा',
  'gupta': 'गुप्ता', 'patel': 'पटेल', 'yadav': 'यादव', 'kushpalpur': 'कुशालपुर',
  'kushalpur': 'कुशालपुर',
};

function toHindi(text?: string | null): string {
  if (!text) return '';
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (HINDI_DICT[lower]) return HINDI_DICT[lower];

  return trimmed.replace(/[a-zA-Z]+/g, (word) => {
    const wLower = word.toLowerCase();
    if (HINDI_DICT[wLower]) return HINDI_DICT[wLower];

    const rules: [string, string][] = [
      ['shri', 'श्री'], ['smt', 'श्रीमती'],
      ['ksha', 'क्ष'], ['tra', 'त्र'], ['gya', 'ज्ञ'],
      ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['chh', 'छ'],
      ['jh', 'झ'], ['th', 'थ'], ['dh', 'ध'], ['ph', 'फ'],
      ['bh', 'भ'], ['sh', 'श'], ['shh', 'ष'],
      ['aa', 'ा'], ['ee', 'ी'], ['oo', 'ू'],
      ['ai', 'ै'], ['au', 'ौ'], ['ae', 'े'],
      ['k', 'क'], ['g', 'ग'], ['j', 'ज'], ['t', 'ट'],
      ['d', 'ड'], ['n', 'न'], ['p', 'प'], ['f', 'फ'],
      ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'],
      ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'],
      ['h', 'ह'], ['z', 'ज़'],
      ['a', 'ा'], ['e', 'े'], ['i', 'ि'], ['o', 'ो'], ['u', 'ु'],
    ];

    let res = '';
    let i = 0;
    while (i < wLower.length) {
      let matched = false;
      for (const [en, hi] of rules) {
        if (wLower.startsWith(en, i)) {
          res += hi;
          i += en.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        res += wLower[i];
        i++;
      }
    }
    const vowelMap: Record<string, string> = { 'ा': 'आ', 'ि': 'इ', 'ी': 'ई', 'ु': 'उ', 'ू': 'ऊ', 'े': 'ए', 'ै': 'ऐ', 'ो': 'ओ', 'ौ': 'औ' };
    res = res.replace(/^[ािीुूेैोौ]/, (m) => vowelMap[m] || m);
    return res;
  });
}

function cleanCareOf(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/^(?:C\/O|S\/O|D\/O|W\/O|c\/o|s\/o|d\/o|w\/o)[:\s]+/i, '').trim();
}

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

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string'
    ? resolve(reader.result)
    : reject(new Error('Saved Aadhaar template could not be read.'));
  reader.onerror = () => reject(new Error('Saved Aadhaar template could not be read.'));
  reader.readAsDataURL(blob);
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
  startSize = 20,
  minSize = 13,
  fontFace = 'Arial, "Nirmala UI", sans-serif',
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
  aadhaarNumber?: string | null;
  aadhaar?: string | null;
  dob?: string | null;
  gender?: string | null;
  mobileNumber?: string | null;
  profileImage?: string | null;
  issueDate?: string | null;
  dateOfIssue?: string | null;
  issuedAt?: string | null;
  generatedAt?: string | null;
  enrolmentNo?: string | null;
  vid?: string | null;
  nameHindi?: string | null;
  addressHindi?: string | null;
  qrData?: string | null;
  qrPayload?: string | null;
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
  data?: AadhaarData | null;
  recordId?: string;
  recordMaskedAadhaar?: string | null;
  template?: AadhaarTemplateInfo | null;
  onUploaded?: (template: AadhaarTemplateInfo) => void;
};

export type AadhaarTemplateInfo = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  createdAt: string;
};

const safe = (v?: string | null) => (v ?? '').trim();

const getAadhaarFileToken = (displayValue: string, isUnmasked: boolean, maskedValue: string) => {
  const fullDigits = displayValue.replace(/\D/g, '');
  if (isUnmasked && fullDigits.length === 12) return fullDigits;
  return maskedValue.replace(/[^0-9X*]/gi, '') || 'masked';
};

function formatVid(vid?: string | null): string {
  if (!vid) return '9110 0445 8669 0808';
  const clean = vid.replace(/\D/g, '');
  if (clean.length === 16) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)} ${clean.slice(12, 16)}`;
  }
  return vid;
}

export default function AadhaarTemplatePreview({ data, recordId, recordMaskedAadhaar, template, onUploaded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [customAadhaar, setCustomAadhaar] = useState<string>('');
  const [downloadPdfBusy, setDownloadPdfBusy] = useState(false);
  const [downloadPngBusy, setDownloadPngBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [savedTemplateUrl, setSavedTemplateUrl] = useState<string | null>(null);
  const [savedTemplateBlob, setSavedTemplateBlob] = useState<Blob | null>(null);
  const [savedFilenameAadhaar, setSavedFilenameAadhaar] = useState('');
  const [error, setError] = useState('');
  const [savedTemplateRetry, setSavedTemplateRetry] = useState(0);

  useEffect(() => () => {
    if (savedTemplateUrl) URL.revokeObjectURL(savedTemplateUrl);
  }, [savedTemplateUrl]);

  const templateId = template?.id;

  useEffect(() => {
    if (!recordId || !templateId) return;
    let active = true;
    getAadhaarTemplateBlob(`${recordId}:${templateId}`, async () => {
      const response = await api.get<Blob>(`/aadhaar-verification/${recordId}/template`, { responseType: 'blob' });
      return response.data;
    })
      .then((blob) => {
        if (!active) return;
        setSavedTemplateBlob(blob);
        setSavedTemplateUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (active) setError('Saved Aadhaar template could not be loaded.');
      });
    return () => { active = false; };
  }, [recordId, templateId, savedTemplateRetry]);

  const sourceData = data ?? {};

  const fullName         = safe(sourceData.fullName).toUpperCase();
  const rawAadhaar       = customAadhaar.trim() || safe(sourceData.aadhaarNumber) || safe(sourceData.aadhaar) || safe(sourceData.maskedAadhaar);
  const effectiveAadhaar = formatAadhaarDisplay(rawAadhaar);
  const isUnmasked       = Boolean(effectiveAadhaar && !effectiveAadhaar.includes('X') && !effectiveAadhaar.includes('*'));
  const fileToken         = getAadhaarFileToken(effectiveAadhaar, isUnmasked, safe(sourceData.maskedAadhaar) || safe(recordMaskedAadhaar) || effectiveAadhaar);
  const downloadBaseName  = `aadhaar-${fileToken}-${(fullName || 'aadhaar').replace(/[^A-Z0-9]/gi, '-').slice(0, 30)}`;
  const hasStableTemplateFileName = Boolean(template?.fileName && /^aadhaar-(?:\d{12}|X{8}\d{4}|masked)-[A-Za-z0-9-]{1,70}\.png$/i.test(template.fileName));
  const savedFilenameDigits = savedFilenameAadhaar.replace(/\D/g, '');
  const savedFileToken = savedFilenameDigits.length === 12 ? savedFilenameDigits : fileToken;
  const savedDownloadBaseName = `aadhaar-${savedFileToken}-${(fullName || 'aadhaar').replace(/[^A-Z0-9]/gi, '-').slice(0, 30)}`;
  const savedDownloadFileName = hasStableTemplateFileName ? template!.fileName : `${savedDownloadBaseName}.png`;
  const dob              = formatAadhaarDate(sourceData.dob);
  const rawGender     = safe(sourceData.gender).toUpperCase();
  const gender        = rawGender === 'M' ? 'MALE' : rawGender === 'F' ? 'FEMALE' : rawGender;
  const mobile        = safe(sourceData.mobileNumber);
  const enrolmentNo   = safe(sourceData.enrolmentNo) || '4049/30507/00690';
  const vid           = formatVid(sourceData.vid);
  const apiIssueDate  =
    safe(sourceData.issueDate) ||
    safe(sourceData.dateOfIssue) ||
    safe(sourceData.issuedAt) ||
    safe(sourceData.generatedAt);
  const issueDate     = formatAadhaarDate(apiIssueDate);
  const effectivePhoto = safe(sourceData.profileImage);

  const addr        = sourceData.address ?? {};
  const careOfRaw   = safe(sourceData.careOf) || safe(sourceData.fatherName) || safe(addr.house);
  const careOf      = cleanCareOf(careOfRaw);
  const hNo         = safe(addr.house);
  const streetLoc   = [safe(addr.street), safe(addr.locality), safe(addr.landmark)].filter(Boolean).join(', ');
  const vtc         = safe(addr.vtc);
  const po          = safe(addr.postOffice);
  const subDist     = safe(addr.subDistrict);
  const district    = safe(addr.district);
  const state       = safe(addr.state);
  const pinCode     = safe(addr.pincode);

  // Transliterated Hindi counterparts
  const careOfHindi    = safe(sourceData.nameHindi) || toHindi(careOf);
  const streetLocHindi = toHindi(streetLoc);
  const districtHindi  = toHindi(district);
  const poHindi        = toHindi(po);
  const stateHindi     = toHindi(state);

  // Construct clean structured JSON text payload so that scanning the QR code triggers
  // a prominent text modal/popup on mobile cameras and QR scanners showing all cardholder data.
  const fullAddress = [
    hNo ? `H No: ${hNo}` : '',
    streetLoc,
    po ? `PO: ${po}` : '',
    subDist ? `Sub-Dist: ${subDist}` : '',
    district ? `Dist: ${district}` : '',
    state ? `${state}` : '',
    pinCode ? `${pinCode}` : '',
  ].filter(Boolean).join(', ');

  const qrJsonObject = {
    name: fullName || undefined,
    aadhaar_number: effectiveAadhaar || undefined,
    dob: dob || undefined,
    gender: gender || undefined,
    care_of: careOf ? (careOfRaw || `C/O: ${careOf}`) : undefined,
    mobile: mobile || undefined,
    house: hNo || undefined,
    street: safe(addr.street) || undefined,
    locality: safe(addr.locality) || undefined,
    vtc: vtc || undefined,
    post_office: po || undefined,
    sub_district: subDist || undefined,
    district: district || undefined,
    state: state || undefined,
    pincode: pinCode || undefined,
    full_address: fullAddress || undefined,
  };

  const defaultJsonQr = JSON.stringify(qrJsonObject, null, 2);
  const rawQr = (sourceData.qrData && sourceData.qrData.trim()) || (sourceData.qrPayload && sourceData.qrPayload.trim());
  const qrText = (rawQr && !rawQr.startsWith('<?xml') && !rawQr.startsWith('<PrintLetterBarcodeData'))
    ? rawQr
    : defaultJsonQr;

  // ── Render canvas whenever data or photo changes ──────────────────────────
  useEffect(() => {
    if (!data) return;
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

      // Clean bottom margin watermark safeguard
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(550, 2260, 700, 80);

      // 2. Draw Top Letter Address Block
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // Enrolment Number next to "नामांकन क्रम/ Enrolment No.:"
      if (enrolmentNo) {
        fitAndDraw(ctx, enrolmentNo, FIELD.enrolmentNo.x, FIELD.enrolmentNo.y, FIELD.enrolmentNo.maxWidth, 20, 15);
      }

      // Name under "To"
      if (fullName) {
        fitAndDraw(ctx, fullName, FIELD.toName.x, FIELD.toName.y, FIELD.toName.maxWidth, 24, 16);
      }
      // C/O
      if (careOf) {
        fitAndDraw(ctx, careOf, FIELD.careOf.x, FIELD.careOf.y, FIELD.careOf.maxWidth, 20, 14);
      }

      // In front of H No & Street Address
      if (hNo) {
        fitAndDraw(ctx, hNo, FIELD.hNo.x, FIELD.hNo.y, FIELD.hNo.maxWidth, 20, 14);
        if (streetLoc) {
          fitAndDraw(ctx, streetLoc, FIELD.streetLine1.x, 975, FIELD.streetLine1.maxWidth, 20, 14);
        }
      } else if (streetLoc) {
        // When hNo is empty, align the house/street identifier right in front of the H No label!
        const commaIdx = streetLoc.indexOf(',');
        const splitIdx = commaIdx !== -1 ? commaIdx : streetLoc.indexOf(' ', 22);
        const part1 = splitIdx !== -1 ? streetLoc.slice(0, splitIdx).trim() : streetLoc;
        const part2 = splitIdx !== -1 ? streetLoc.slice(splitIdx + 1).trim() : '';

        // Directly in front of H No:
        fitAndDraw(ctx, part1, FIELD.hNo.x, FIELD.hNo.y, FIELD.hNo.maxWidth, 20, 14);
        // And next line for remaining colony/locality:
        if (part2) {
          fitAndDraw(ctx, part2, FIELD.streetLine1.x, 975, FIELD.streetLine1.maxWidth, 20, 14);
        }
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

      // 4. Draw Large Aadhaar Number & VID on Top Letter
      if (effectiveAadhaar) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 38px "Arial Black", Arial, sans-serif';
        ctx.letterSpacing = '5px';
        ctx.fillText(effectiveAadhaar, FIELD.topAadhaar.x, FIELD.topAadhaar.y);
        ctx.letterSpacing = '0px';
      }
      if (vid) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'left';
        ctx.font = 'bold 19px Arial, sans-serif';
        ctx.letterSpacing = '2px';
        ctx.fillText(vid, FIELD.topVid.x, FIELD.topVid.y);
        ctx.letterSpacing = '0px';
      }

      // 5. Draw Bottom Left Card (Front of Card)
      // Profile Photo
      if (photoEl) {
        drawCover(ctx, photoEl, FIELD.photo.x, FIELD.photo.y, FIELD.photo.width, FIELD.photo.height);
      }

      // Issue date vertically aligned next to "Aadhaar no. issued:"
      if (issueDate) {
        ctx.save();
        ctx.translate(FIELD.issueDate.x, FIELD.issueDate.y);
        ctx.rotate(-Math.PI / 2);
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'left';
        ctx.fillText(issueDate, 0, 0);
        ctx.restore();
      }

      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';

      // Name next to "Name:"
      if (fullName) {
        fitAndDraw(ctx, fullName, FIELD.cardName.x, FIELD.cardName.y, FIELD.cardName.maxWidth, 22, 16);
      }
      // DOB next to "जन्म तिथि/DOB:"
      if (dob) {
        fitAndDraw(ctx, dob, FIELD.cardDob.x, FIELD.cardDob.y, FIELD.cardDob.maxWidth, 21, 15);
      }
      // Gender next to "Gender:"
      if (gender) {
        fitAndDraw(ctx, gender, FIELD.cardGender.x, FIELD.cardGender.y, FIELD.cardGender.maxWidth, 21, 15);
      }

      // Card Aadhaar Number (Centered on the front card)
      if (effectiveAadhaar) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 38px "Arial Black", Arial, sans-serif';
        ctx.letterSpacing = '5px';
        ctx.fillText(effectiveAadhaar, FIELD.cardAadhaar.x, FIELD.cardAadhaar.y);
        ctx.letterSpacing = '0px';
      }

      // 6. Draw Bottom Right Card (Back of Card)
      // Hindi Address Block (Top half of address area)
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';
      const devanagariFont = '"Nirmala UI", "Mangal", Arial, sans-serif';

      if (careOfHindi) {
        fitAndDraw(ctx, careOfHindi, FIELD.hindiCareOf.x, FIELD.hindiCareOf.y, FIELD.hindiCareOf.maxWidth, 17, 13, devanagariFont);
      }
      if (streetLocHindi) {
        fitAndDraw(ctx, streetLocHindi, FIELD.hindiStreet.x, FIELD.hindiStreet.y, FIELD.hindiStreet.maxWidth, 16, 12, devanagariFont);
      }
      const hindiDistStatePin = [
        poHindi ? `डाक: ${poHindi}` : '',
        districtHindi ? `जिला: ${districtHindi}` : '',
        stateHindi ? stateHindi : '',
        pinCode ? `- ${pinCode}` : '',
      ].filter(Boolean).join(', ').replace(', - ', ' - ');
      if (hindiDistStatePin) {
        fitAndDraw(ctx, hindiDistStatePin, FIELD.hindiDist.x, FIELD.hindiDist.y, FIELD.hindiDist.maxWidth, 16, 12, devanagariFont);
      }

      // Clean white-out over the messy template fragments (C/O:, H No, PO:, DIST:)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(FIELD.backWhiteout.x, FIELD.backWhiteout.y, FIELD.backWhiteout.width, FIELD.backWhiteout.height);
      ctx.fillStyle = '#111111';

      // Clean, perfectly formatted 4-line English address
      const engLine1 = `C/O: ${careOf}${hNo ? ', H No: ' + hNo : ''}`;
      fitAndDraw(ctx, engLine1, FIELD.backCareOf.x, FIELD.backCareOf.y, FIELD.backCareOf.maxWidth, 16, 12);

      if (streetLoc) {
        fitAndDraw(ctx, streetLoc, FIELD.backStreet.x, FIELD.backStreet.y, FIELD.backStreet.maxWidth, 16, 12);
      }

      const engLine3 = [
        po ? `PO: ${po}` : (vtc ? `VTC: ${vtc}` : ''),
        district ? `Dist: ${district}` : '',
      ].filter(Boolean).join(', ');
      if (engLine3) {
        fitAndDraw(ctx, engLine3, FIELD.backPoDist.x, FIELD.backPoDist.y, FIELD.backPoDist.maxWidth, 16, 12);
      }

      const engLine4 = [state, pinCode].filter(Boolean).join(' - ');
      if (engLine4) {
        fitAndDraw(ctx, engLine4, FIELD.backStatePin.x, FIELD.backStatePin.y, FIELD.backStatePin.maxWidth, 16, 12);
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

      // 7. Back Card Bottom - 12-digit Aadhaar Number + Dotted Line + VID (Matching Image 4 exactly)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(FIELD.backBottomWhiteout.x, FIELD.backBottomWhiteout.y, FIELD.backBottomWhiteout.width, FIELD.backBottomWhiteout.height);

      // Large bold 12-digit Aadhaar number centered above dotted line
      if (effectiveAadhaar) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px "Arial Black", Arial, sans-serif';
        ctx.letterSpacing = '4px';
        ctx.fillText(effectiveAadhaar, FIELD.backAadhaar.x, FIELD.backAadhaar.y);
        ctx.letterSpacing = '0px';
      }

      // Continuous horizontal dotted line
      ctx.save();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(FIELD.backDottedLine.x1, 2138);
      ctx.lineTo(FIELD.backDottedLine.x2, 2138);
      ctx.stroke();
      ctx.restore();

      // VID : 9164 0981 9904 1660 centered below dotted line
      if (vid) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.font = 'bold 20px Arial, sans-serif';
        ctx.letterSpacing = '2px';
        ctx.fillText(`VID : ${vid}`, FIELD.backVid.x, FIELD.backVid.y);
        ctx.letterSpacing = '0px';
      }
    };

    render().catch(() => {
      if (active) setError('Aadhaar template could not be rendered.');
    });

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, effectiveAadhaar, dob, gender, mobile, effectivePhoto, qrText,
      careOf, hNo, streetLoc, vtc, po, subDist, district, state, pinCode, enrolmentNo, vid, issueDate]);

  // ── Download actions ─────────────────────────────────────────────────────
  const downloadSavedPdf = async () => {
    if (!savedTemplateBlob || !template) {
      setError('Saved Aadhaar template is still loading. Please try again.');
      return;
    }
    setDownloadPdfBusy(true);
    setError('');
    try {
      const image = await blobToDataUrl(savedTemplateBlob);
      const { pdf } = await import('@react-pdf/renderer');
      const { AadhaarTemplatePdfDocument } = await import('./AadhaarTemplatePdfDocument');
      const pdfBlob = await pdf(<AadhaarTemplatePdfDocument image={image} />).toBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = savedDownloadFileName.replace(/\.png$/i, '.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saved Aadhaar PDF download failed.');
    } finally {
      setDownloadPdfBusy(false);
    }
  };

  if (!data && template && !savedTemplateUrl) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5" aria-live="polite">
        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setError('');
                setSavedTemplateRetry((value) => value + 1);
              }}
              className="rounded-lg bg-white px-3 py-1.5 font-bold text-red-700 shadow-xs ring-1 ring-red-200 hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading saved template...
          </div>
        )}
      </section>
    );
  }

  if (!data && template && savedTemplateUrl) {
    return (
      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-xs sm:p-5" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 pb-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Saved Aadhaar Card Template</h3>
            <p className="mt-1 text-xs text-slate-500">Uploaded template from secure history</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={savedTemplateUrl} download={savedDownloadFileName} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700">
              <Download className="h-3.5 w-3.5" /> Download PNG
            </a>
            <button
              type="button"
              onClick={() => void downloadSavedPdf()}
              disabled={downloadPdfBusy || !savedTemplateBlob}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloadPdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {downloadPdfBusy ? 'Preparing PDF...' : 'Download PDF'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex justify-center overflow-auto rounded-xl border border-slate-200 bg-white p-2">
          {/* The file is served by the authenticated API and rendered from a local object URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={savedTemplateUrl} alt="Saved Aadhaar template" className="h-auto max-h-[70vh] w-auto max-w-full" />
        </div>
        {!hasStableTemplateFileName ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <label htmlFor="saved-aadhaar-filename-number" className="block text-xs font-bold text-slate-800">Full Aadhaar number for filename (optional)</label>
            <input
              id="saved-aadhaar-filename-number"
              type="text"
              value={savedFilenameAadhaar}
              onChange={(event) => setSavedFilenameAadhaar(formatAadhaarDisplay(event.target.value.replace(/\D/g, '').slice(0, 12)))}
              placeholder="XXXX XXXX XXXX"
              maxLength={14}
              inputMode="numeric"
              className="mt-1.5 w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold tracking-wider text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">Used only for this PNG/PDF download filename; saved verification data is not changed.</p>
          </div>
        ) : null}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-live="polite">
        <div className="flex items-start gap-2 text-sm text-amber-800">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || 'Saved template metadata is unavailable.'}</span>
        </div>
      </section>
    );
  }

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
      a.href = url;
      a.download = `${downloadBaseName}.png`;
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
      a.href = url;
      a.download = `${downloadBaseName}.pdf`;
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

  const uploadTemplate = async () => {
    if (!recordId) {
      setError('Aadhaar verification record is not available for saving.');
      return;
    }
    setUploadBusy(true);
    setError('');
    try {
      const blob = await getCanvasBlob();
      const formData = new FormData();
      formData.append('template', new File([blob], `${downloadBaseName}.png`, { type: 'image/png' }));
      const response = await api.post<{ template?: AadhaarTemplateInfo }>(`/aadhaar-verification/${recordId}/template`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const savedTemplate = response.data.template;
      if (!savedTemplate) throw new Error('Aadhaar template metadata was not returned.');
      setSavedTemplateBlob(blob);
      setSavedTemplateUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        rememberAadhaarTemplateBlob(`${recordId}:${savedTemplate.id}`, blob);
        return URL.createObjectURL(blob);
      });
      onUploaded?.(savedTemplate);
    } catch (err) {
      setError(getAadhaarApiError(err, 'Aadhaar template upload failed.'));
    } finally {
      setUploadBusy(false);
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
            <CheckCircle2 className="h-3.5 w-3.5" /> {template ? 'Template saved securely' : 'DigiLocker verified'}
          </span>
          {!template ? (
            <button
              type="button"
              onClick={() => void uploadTemplate()}
              disabled={uploadBusy || !recordId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-xs transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {uploadBusy ? 'Uploading...' : 'Upload & Save Template'}
            </button>
          ) : null}
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

      {/* Aadhaar Number Control (Full 12-digit without mask) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3">
        <div>
          <p className="text-xs font-bold text-slate-800">Aadhaar Number (12-Digit Unmasked)</p>
          <p className="text-[11px] text-slate-500">
            {isUnmasked
              ? 'Displaying full 12-digit unmasked number on template and QR code.'
              : 'UIDAI DigiLocker provides masked number. Enter the full 12 digits to display unmasked on the template.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customAadhaar !== '' ? customAadhaar : (effectiveAadhaar || '')}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 12);
              setCustomAadhaar(formatAadhaarDisplay(cleaned));
            }}
            placeholder="1234 5678 9012"
            maxLength={14}
            className="w-44 rounded-lg border border-slate-300 px-3 py-1 text-xs font-mono font-bold tracking-wider text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          {customAadhaar ? (
            <button
              type="button"
              onClick={() => setCustomAadhaar('')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {/* Canvas preview */}
      <div className="mt-4 flex items-center justify-center overflow-x-auto py-2">
        <div className="relative max-w-full overflow-hidden rounded-[14px] shadow-[0_12px_30px_-5px_rgba(15,23,42,0.30)]">
          {template && savedTemplateUrl ? (
            // The saved artifact is the source of truth after upload.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={savedTemplateUrl} alt="Saved Aadhaar template" className="block h-auto w-[460px] max-w-full select-none" />
          ) : (
            <canvas
              ref={canvasRef}
              className="block h-auto w-[460px] max-w-full select-none"
              aria-label="Generated Aadhaar template"
            />
          )}
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] text-slate-400">
        Template generated directly from verified DigiLocker data · For reference & official KYC verification only
      </p>
    </section>
  );
}
