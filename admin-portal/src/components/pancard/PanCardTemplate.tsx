'use client';

import React, { useMemo, useState } from 'react';
import QrCodeSvg from './QrCodeSvg';
import PanCardBackTemplate from './PanCardBackTemplate';
import { resolvePanCardSignatureUrl } from './panCardDisplay.mjs';

export { PanCardBackTemplate };

export interface PanCardData {
  panNumber?: string;
  pan_number?: string;
  name?: string;
  fullName?: string;
  full_name?: string;
  fatherName?: string;
  father_name?: string;
  dob?: string;
  dateOfBirth?: string;
  date_of_birth?: string;
  dateOfIssue?: string;
  date_of_issue?: string;
  photoUrl?: string;
  photo_url?: string;
  signatureUrl?: string;
  signature_url?: string;
  signatureText?: string;
  qrData?: string;
}

export interface PanCardTemplateProps {
  data?: PanCardData | null;
  className?: string;
  scale?: number;
  interactive?: boolean;
  side?: 'front' | 'back';
}

export function formatPanDate(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const parts = clean.split('T')[0].split('-');
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

/**
 * 1:1 Authentic Indian PAN Card (Permanent Account Number Card)
 * ID-1 Format: 85.60mm x 53.98mm (490px x 305px)
 * Uses high-res authentic PAN card base template image with real-time dynamic API overlays:
 * - Center: Dynamic PAN Number
 * - Left: Applicant Photo, Name, Father's Name, Date of Birth
 * - Right: Real-time dynamic QR code
 * - Center-Bottom: Dynamic cursive signature
 */
export default function PanCardTemplate({
  data,
  className = '',
  scale = 1,
  interactive = true,
  side = 'front',
}: PanCardTemplateProps) {
  const [photoError, setPhotoError] = useState(false);
  const [sigError, setSigError] = useState(false);

  const hasProvidedData = Boolean(data && Object.keys(data).length > 0);
  const pan = (data?.panNumber || data?.pan_number || (hasProvidedData ? '—' : 'ABCDE1234F')).toUpperCase().trim();

  const rawName = data?.name || data?.fullName || data?.full_name;
  const isNameValid = Boolean(
    rawName &&
    !['-', '—', 'not available', 'not applicable', 'null', 'undefined'].includes(
      String(rawName).trim().toLowerCase()
    )
  );
  const name = (isNameValid ? String(rawName) : (hasProvidedData ? '—' : 'ROHIT KUMAR')).toUpperCase().trim();

  const rawFather = data?.fatherName || data?.father_name;
  const isFatherValid = Boolean(
    rawFather &&
    !['-', '—', 'not available', 'not applicable', 'null', 'undefined'].includes(
      String(rawFather).trim().toLowerCase()
    )
  );
  const fatherName = isFatherValid
    ? String(rawFather).toUpperCase().trim()
    : (hasProvidedData ? '—' : 'SURESH KUMAR');

  const rawDob = data?.dob || data?.dateOfBirth || data?.date_of_birth;
  const isDobValid = Boolean(
    rawDob &&
    !['-', '—', 'not available', 'not applicable', 'null', 'undefined'].includes(
      String(rawDob).trim().toLowerCase()
    )
  );
  const dob = isDobValid ? formatPanDate(String(rawDob)) : (hasProvidedData ? '—' : '15/08/1990');
  const photoUrl = data ? data.photoUrl || data.photo_url : undefined;
  const signatureUrl = resolvePanCardSignatureUrl(data);
  const signatureText = data?.signatureText
    ? data.signatureText
    : isNameValid
      ? name.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
      : (hasProvidedData ? 'Signature' : 'Rohit Kumar');

  const nameLen = name.length;
  const nameSizeStyle: React.CSSProperties = {
    fontSize: nameLen > 24 ? '9.5px' : nameLen > 18 ? '10.5px' : '11.5px',
    textShadow: '0 0.5px 0.5px rgba(255,255,255,0.6)',
  };

  const fatherLen = fatherName.length;
  const fatherSizeStyle: React.CSSProperties = {
    fontSize: fatherLen > 24 ? '9.5px' : fatherLen > 18 ? '10.5px' : '11.5px',
    textShadow: '0 0.5px 0.5px rgba(255,255,255,0.6)',
  };

  const qrPayload = useMemo(() => {
    if (data?.qrData) return data.qrData;
    const lines = [
      'INCOME TAX DEPARTMENT',
      `PAN: ${pan}`,
      name ? `Name: ${name}` : '',
      fatherName ? `Father's Name: ${fatherName}` : '',
      dob ? `Date of Birth: ${dob}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  }, [data?.qrData, pan, name, fatherName, dob]);

  if (side === 'back') {
    return (
      <PanCardBackTemplate
        className={className}
        scale={scale}
        interactive={interactive}
      />
    );
  }

  return (
    <div
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
      }}
      className={`relative inline-block transition-transform duration-300 ${className}`}
    >
      {/*
        Standard PAN Card — ID-1 Format (85.60mm × 53.98mm) = 490px × 305px
        Base template image with absolute pixel-accurate live API field overlays.
      */}
      <div
        data-pan-card-surface="true"
        className={`relative w-[490px] h-[305px] select-none overflow-hidden rounded-[14px] text-slate-900 transition-all ${
          interactive
            ? 'hover:shadow-[0_24px_50px_-10px_rgba(15,23,42,0.40)] hover:-translate-y-0.5'
            : ''
        }`}
        style={{
          boxShadow: '0 12px 30px -5px rgba(15,23,42,0.30), 0 0 0 1px rgba(255,255,255,0.75) inset',
        }}
      >
        {/* ── BASE TEMPLATE IMAGE (Official background, headers, emblem, labels & watermark) ── */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/pancard/pan-card-template-v2.jpg"
          alt="PAN Card Template"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none z-0"
        />

        {/* ── DYNAMIC FIELD 1: PAN NUMBER ── */}
        <div
          className="absolute z-10 select-none text-center"
          style={{
            top: '40.6%',
            left: '45.8%',
            transform: 'translateX(-50%)',
          }}
        >
          <span
            className="font-sans text-[17px] font-black tracking-normal text-[#000000]"
            style={{
              fontFamily: '"Arial Black", Impact, Arial, sans-serif',
              textShadow: '0 0.5px 1px rgba(255,255,255,0.7)',
            }}
          >
            {pan}
          </span>
        </div>

        {/* ── DYNAMIC FIELD 2: APPLICANT PHOTO (Overlay if provided, else template silhouette remains) ── */}
        {!photoError && photoUrl && photoUrl !== '/images/pancard/rohit-kumar.png' ? (
          <div
            className="absolute z-10 overflow-hidden"
            style={{
              top: '27.4%',
              left: '5.6%',
              width: '17.2%',
              height: '27.8%',
              borderRadius: 3,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={name}
              className="h-full w-full object-cover"
              onError={() => setPhotoError(true)}
            />
          </div>
        ) : null}

        {/* ── DYNAMIC FIELD 3: APPLICANT NAME ── */}
        <div
          className="absolute z-10 select-none overflow-hidden"
          style={{
            top: '63.2%',
            left: '5.6%',
            width: '42%',
          }}
        >
          <p
            className="font-black text-[#08152a] uppercase tracking-wide leading-tight truncate"
            style={nameSizeStyle}
          >
            {name}
          </p>
        </div>

        {/* ── DYNAMIC FIELD 4: FATHER'S NAME ── */}
        <div
          className="absolute z-10 select-none overflow-hidden"
          style={{
            top: '76.2%',
            left: '5.6%',
            width: '42%',
          }}
        >
          <p
            className="font-black text-[#08152a] uppercase tracking-wide leading-tight truncate"
            style={fatherSizeStyle}
          >
            {fatherName}
          </p>
        </div>

        {/* ── DYNAMIC FIELD 5: DATE OF BIRTH ── */}
        <div
          className="absolute z-10 select-none overflow-hidden"
          style={{
            top: '90.5%',
            left: '5.6%',
            width: '42%',
          }}
        >
          <p
            className="font-mono text-[11px] font-black text-[#08152a] tracking-wider leading-none"
            style={{ textShadow: '0 0.5px 0.5px rgba(255,255,255,0.6)' }}
          >
            {dob}
          </p>
        </div>

        {/* ── DYNAMIC FIELD 6: QR CODE (Overlaid cleanly on the white QR box) ── */}
        <div
          className="absolute z-10 flex items-center justify-center p-[4px] bg-white rounded-[4px]"
          style={{
            top: '31.8%',
            left: '69.5%',
            width: '23.8%',
            height: '38.2%',
          }}
        >
          <QrCodeSvg value={qrPayload} size={86} />
        </div>

        {/* ── DYNAMIC FIELD 7: SIGNATURE (Only if valid image signature is uploaded) ── */}
        {!sigError && signatureUrl ? (
          <div
            className="absolute z-10 flex items-center justify-center select-none"
            style={{
              top: '75.5%',
              left: '43.0%',
              transform: 'translateX(-50%)',
              width: '25%',
              height: '11.5%',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signatureUrl}
              alt="Signature"
              className="max-h-full max-w-full object-contain"
              onError={() => setSigError(true)}
            />
          </div>
        ) : null}

        {/* ── LAYER: Subtle PVC Glare Overlay ── */}
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background:
              'linear-gradient(118deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.05) 30%, transparent 60%)',
          }}
        />
      </div>
    </div>
  );
}
