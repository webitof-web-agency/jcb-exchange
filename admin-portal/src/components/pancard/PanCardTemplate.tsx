'use client';

import React, { useMemo, useState } from 'react';
import NationalEmblemSvg from './NationalEmblemSvg';
import QrCodeSvg from './QrCodeSvg';
import HologramSeal from './HologramSeal';
import GuillochePatternSvg from './GuillochePatternSvg';

import PanCardBackTemplate from './PanCardBackTemplate';

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

function formatPanDate(dateStr?: string): string {
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
 * ID-1 Format: 85.60mm x 53.98mm (Aspect Ratio 1.5858)
 * Supports both Front and Back sides seamlessly.
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
  const [emblemError, setEmblemError] = useState(false);

  if (side === 'back') {
    return (
      <PanCardBackTemplate
        className={className}
        scale={scale}
        interactive={interactive}
      />
    );
  }

  const pan = (data?.panNumber || data?.pan_number || 'ABCDE1234F').toUpperCase().trim();
  const name = (data?.name || data?.fullName || data?.full_name || 'ROHIT KUMAR').toUpperCase().trim();
  const fatherName = (data?.fatherName || data?.father_name || 'SURESH KUMAR').toUpperCase().trim();
  const dob = formatPanDate(data?.dob || data?.dateOfBirth || data?.date_of_birth || '15/08/1990');
  const dateOfIssue = formatPanDate(data?.dateOfIssue || data?.date_of_issue || '20/05/2024');
  const photoUrl = data?.photoUrl || data?.photo_url || '/images/pancard/rohit-kumar.png';
  const signatureUrl = data?.signatureUrl || data?.signature_url || '/images/pancard/rohit-signature.png';
  const signatureText = data?.signatureText || 'Rohit Kumar';

  const qrPayload = useMemo(() => {
    if (data?.qrData) return data.qrData;
    return `PAN:${pan}|NAME:${name}|FATHER:${fatherName}|DOB:${dob}`;
  }, [data?.qrData, pan, name, fatherName, dob]);

  return (
    <div
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
      }}
      className={`relative inline-block transition-transform duration-300 ${className}`}
    >
      {/* 
        Standard PAN Card Container (ID-1 Format: 85.60mm x 53.98mm)
        Dimensions: 490px x 309px
      */}
      <div
        className={`relative w-[490px] h-[309px] select-none overflow-hidden rounded-[16px] border border-sky-300/70 text-slate-900 transition-all ${
          interactive
            ? 'hover:shadow-[0_22px_45px_-10px_rgba(15,23,42,0.35)] hover:-translate-y-0.5'
            : ''
        }`}
        style={{
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.7) inset, 0 1px 3px 0 rgba(0, 0, 0, 0.12)',
          /* Authentic multi-layered background matching real PAN Card photography */
          background: `
            radial-gradient(ellipse 65% 60% at 10% 86%, #9d88b7 0%, #a894bf 35%, #bca9ce 55%, transparent 85%),
            radial-gradient(ellipse 45% 55% at 5% 38%, #9e91b5 0%, #b4a7ca 40%, transparent 80%),
            radial-gradient(ellipse 50% 45% at 18% 12%, #9b98b8 0%, #b1a9c4 40%, transparent 75%),
            radial-gradient(ellipse 55% 50% at 88% 16%, #7091bd 0%, #82a3cc 40%, transparent 75%),
            radial-gradient(ellipse 65% 60% at 92% 84%, #7fb1d3 0%, #89bade 45%, transparent 85%),
            linear-gradient(135deg, #96bce0 0%, #89b3d8 30%, #7aa8d5 65%, #7eaed4 100%)
          `,
        }}
      >
        {/* Layer 1: Guilloché Security Pattern Background */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <GuillochePatternSvg />
        </div>



        {/* Layer 3: PVC Plastic Card Specular Glare Overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background:
              'linear-gradient(118deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 28%, transparent 55%)',
          }}
        />

        {/* ----------------- TOP HEADER ----------------- */}
        <div className="relative z-10 flex items-start justify-between px-4 pt-3 pb-0">
          {/* Left: Income Tax Department */}
          <div className="w-[160px] text-left">
            <h2 className="text-[13px] font-extrabold tracking-tight text-[#0f172a] leading-tight">
              आयकर विभाग
            </h2>
            <p className="text-[9px] font-extrabold tracking-wider text-[#0f172a] uppercase leading-none mt-0.5">
              INCOME TAX DEPARTMENT
            </p>
          </div>

          {/* Center: State Emblem of India (Ashoka Lion Capital) */}
          <div className="flex flex-col items-center justify-center -mt-1 select-none">
            {!emblemError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="w-[28px] h-[36px] flex items-center justify-center">
                <img
                  src="/images/pancard/ashoka-emblem.png"
                  alt="State Emblem of India"
                  className="max-h-full max-w-full object-contain filter contrast-110 drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.15)]"
                  onError={() => setEmblemError(true)}
                />
              </div>
            ) : (
              <NationalEmblemSvg width={26} height={34} className="text-[#0f172a]" />
            )}
          </div>

          {/* Right: Govt of India */}
          <div className="w-[160px] text-right">
            <h2 className="text-[13px] font-extrabold tracking-tight text-[#0f172a] leading-tight">
              भारत सरकार
            </h2>
            <p className="text-[9px] font-extrabold tracking-wider text-[#0f172a] uppercase leading-none mt-0.5">
              GOVT. OF INDIA
            </p>
          </div>
        </div>

        {/* Sub-Header & Bold Letter-Spaced PAN Number */}
        <div className="relative z-10 -mt-0.5 text-center">
          <p className="text-[10px] font-bold text-[#0f172a] leading-tight">
            स्थायी लेखा संख्या कार्ड
          </p>
          <p className="text-[8.5px] font-semibold text-[#1e293b] tracking-tight leading-tight">
            Permanent Account Number Card
          </p>
          <div className="mt-1">
            <span
              className="font-mono text-[17px] font-black tracking-[0.24em] text-[#0b1329] drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)]"
              style={{ fontFeatureSettings: '"tnum" 1' }}
            >
              {pan}
            </span>
          </div>
        </div>

        {/* ----------------- CARD BODY ----------------- */}
        <div className="relative z-10 mt-1 flex px-4 gap-3.5 items-start">
          {/* LEFT: Photograph & Signature */}
          <div className="flex flex-col shrink-0 items-start w-[105px]">
            {/* Passport Photo Frame */}
            <div className="relative h-[118px] w-[96px] overflow-hidden rounded-[8px] border-2 border-white bg-slate-200 shadow-[0_2px_4px_rgba(0,0,0,0.15)]">
              {!photoError && photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt={name}
                  className="h-full w-full object-cover"
                  onError={() => setPhotoError(true)}
                />
              ) : (
                /* Fallback neutral passport silhouette */
                <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-100 to-slate-300 text-slate-500">
                  <svg viewBox="0 0 40 40" className="w-12 h-12 text-slate-400 fill-current">
                    <circle cx="20" cy="14" r="7" />
                    <path d="M 8 36 C 8 28, 14 24, 20 24 C 26 24, 32 28, 32 36 Z" />
                  </svg>
                  <span className="text-[8px] font-bold tracking-wider uppercase text-slate-600 mt-1">
                    Photo
                  </span>
                </div>
              )}
            </div>

            {/* Signature Area */}
            <div className="mt-1.5 w-full text-left">
              <span className="block text-[8px] font-semibold text-[#1e293b] leading-tight">
                हस्ताक्षर / Signature
              </span>
              <div className="h-[28px] w-[96px] mt-0.5 flex items-center justify-center overflow-hidden rounded-[4px] bg-white/80 border border-slate-300/70 shadow-2xs px-1">
                {!sigError && signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatureUrl}
                    alt="Signature"
                    className="max-h-full max-w-full object-contain filter contrast-125"
                    onError={() => setSigError(true)}
                  />
                ) : (
                  <span
                    className="font-serif italic text-[15px] font-bold text-[#0f172a] tracking-wide select-none leading-none -rotate-[2deg] transform truncate"
                    style={{
                      fontFamily: '"Brush Script MT", "Segoe Script", "Dancing Script", cursive, sans-serif',
                    }}
                  >
                    {signatureText}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* MIDDLE: Name, Father's Name, Date of Birth */}
          <div className="flex flex-col flex-1 min-w-0 pt-0.5 space-y-2">
            {/* Name */}
            <div>
              <p className="text-[8.5px] font-bold text-[#1e293b] leading-none">
                नाम / Name
              </p>
              <p className="text-[12.5px] font-black text-[#0f172a] uppercase tracking-wide leading-tight mt-0.5 truncate drop-shadow-[0_0.5px_0.5px_rgba(255,255,255,0.7)]">
                {name}
              </p>
            </div>

            {/* Father's Name */}
            <div>
              <p className="text-[8.5px] font-bold text-[#1e293b] leading-none">
                पिता का नाम / Father&apos;s Name
              </p>
              <p className="text-[12.5px] font-black text-[#0f172a] uppercase tracking-wide leading-tight mt-0.5 truncate drop-shadow-[0_0.5px_0.5px_rgba(255,255,255,0.7)]">
                {fatherName || '—'}
              </p>
            </div>

            {/* Date of Birth */}
            <div>
              <p className="text-[8.5px] font-bold text-[#1e293b] leading-none">
                जन्म तिथि / Date of Birth
              </p>
              <p className="font-mono text-[12px] font-black text-[#0f172a] tracking-wider leading-tight mt-0.5 drop-shadow-[0_0.5px_0.5px_rgba(255,255,255,0.7)]">
                {dob}
              </p>
            </div>
          </div>

          {/* RIGHT: QR Code, Hologram Seal, Date of Issue */}
          <div className="flex flex-col items-end shrink-0 w-[114px] space-y-2">
            {/* QR Code Container with Crisp White Rounded Box */}
            <div className="rounded-[8px] border-2 border-white bg-white p-1 shadow-[0_2px_4px_rgba(0,0,0,0.12)]">
              <QrCodeSvg value={qrPayload} size={64} />
            </div>

            {/* Bottom-Right: Silver Hologram & Date of Issue */}
            <div className="flex items-center gap-2 justify-end w-full pt-0.5">
              {/* Silver Metallic Hologram */}
              <div className="shrink-0 -ml-2">
                <HologramSeal size={48} />
              </div>

              {/* Date of Issue */}
              <div className="text-right min-w-0">
                <p className="text-[7.5px] font-bold text-[#1e293b] leading-tight">
                  जारी तिथि
                </p>
                <p className="text-[7.5px] font-bold text-[#1e293b] leading-tight">
                  Date of Issue
                </p>
                <p className="font-mono text-[10px] font-black text-[#0f172a] leading-tight mt-0.5">
                  {dateOfIssue}
                </p>
              </div>
            </div>
          </div>
        </div>



        {/* Bottom subtle edge line */}
        <div className="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-sky-400/50 via-indigo-500/40 to-sky-400/50" />
      </div>
    </div>
  );
}
