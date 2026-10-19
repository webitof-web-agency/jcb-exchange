'use client';

import React, { useMemo, useState } from 'react';
import NationalEmblemSvg from '../pancard/NationalEmblemSvg';
import QrCodeSvg from '../pancard/QrCodeSvg';
import AadhaarLogoSvg from './AadhaarLogoSvg';
import AadhaarBackTemplate from './AadhaarBackTemplate';
import AadhaarHeaderRibbon from './AadhaarHeaderRibbon';
import EAadhaarFullTemplate, { EAadhaarData } from './EAadhaarFullTemplate';
import { Scissors } from 'lucide-react';

export { AadhaarBackTemplate, EAadhaarFullTemplate };
export type { EAadhaarData };

export interface AadhaarCardData extends EAadhaarData {
  aadhaarNumber?: string;
  aadhaar_number?: string;
  name?: string;
  nameEnglish?: string;
  name_english?: string;
  nameHindi?: string;
  name_hindi?: string;
  fatherNameHindi?: string;
  father_name_hindi?: string;
  fatherNameEnglish?: string;
  father_name_english?: string;
  dob?: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  genderHindi?: string;
  photoUrl?: string;
  photo_url?: string;
  qrData?: string;
  issue_date?: string;
  addressHindi?: string;
  address_hindi?: string;
  addressEnglish?: string;
  address_english?: string;
}

export interface AadhaarCardTemplateProps {
  data?: AadhaarCardData | null;
  className?: string;
  scale?: number;
  interactive?: boolean;
  side?: 'front' | 'back' | 'full';
}

function formatAadhaarNumber(num?: string): string {
  if (!num) return '1234 5678 9101';
  const clean = num.replace(/\D/g, '');
  if (clean.length === 12) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)}`;
  }
  return num;
}

/**
 * 1:1 Pixel-Perfect Authentic UIDAI Indian Aadhaar Card Template
 * ID-1 Format: 85.60mm x 53.98mm (Dimensions: 490px x 309px)
 * Supports:
 * - side="full": Complete Official e-Aadhaar Letter Document (Matching UIDAI PDF Letter)
 * - side="front": Front wallet cut-out card with emblem, flag wave, photo, ghost photo, and disclaimer
 * - side="back": Back wallet card with bilingual address and 1947 helpline footer
 */
export default function AadhaarCardTemplate({
  data,
  className = '',
  scale = 1,
  interactive = true,
  side = 'front',
}: AadhaarCardTemplateProps) {
  const [photoError, setPhotoError] = useState(false);
  const [emblemError, setEmblemError] = useState(false);

  if (side === 'full') {
    return (
      <EAadhaarFullTemplate
        data={data}
        className={className}
        scale={scale}
        interactive={interactive}
      />
    );
  }

  const aadhaarNumber = data?.aadhaarNumber || data?.aadhaar_number || '1234 5678 9101';
  const addressHindi =
    data?.addressHindi ||
    data?.address_hindi ||
    'सरायं दान शाह, कतरौली, पूरे दुर्गी, फूलपुर, इलाहाबाद, उत्तर प्रदेश, 212402';
  const addressEnglish =
    data?.addressEnglish ||
    data?.address_english ||
    'saray dan shah, KATRAULI, Poore Durgi, Phoolpur, Allahabad, Uttar Pradesh, 212402';

  if (side === 'back') {
    return (
      <AadhaarBackTemplate
        aadhaarNumber={aadhaarNumber}
        addressHindi={addressHindi}
        addressEnglish={addressEnglish}
        className={className}
        scale={scale}
        interactive={interactive}
      />
    );
  }

  const nameHindi = data?.nameHindi || data?.name_hindi || 'मेराज खान';
  const nameEnglish = (data?.nameEnglish || data?.name_english || data?.name || 'MERAJ KHAN').trim();
  const fatherHindi = data?.fatherNameHindi || data?.father_name_hindi || 'सुध्दशन खांन';
  const fatherEnglish = data?.fatherNameEnglish || data?.father_name_english || 'Sudhdan Khan';
  const dob = data?.dob || '12/12/1988';
  const gender = data?.gender || 'Male';
  const genderHindi = data?.genderHindi || (gender.toLowerCase().startsWith('f') ? 'महिला' : 'पुरुष');
  const photoUrl = data?.photoUrl || data?.photo_url || '';
  const issueDate = data?.issueDate || data?.issue_date || '10/07/2025';

  const qrPayload = useMemo(() => {
    if (data?.qrData) return data.qrData;
    return `UIDAI:${aadhaarNumber}|NAME:${nameEnglish}|DOB:${dob}|GENDER:${gender}`;
  }, [data?.qrData, aadhaarNumber, nameEnglish, dob, gender]);

  const formattedAadhaar = formatAadhaarNumber(aadhaarNumber);

  const aadhaarParts = useMemo(() => {
    const clean = aadhaarNumber.replace(/\D/g, '');
    if (clean.length === 12) {
      return [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)];
    }
    const split = aadhaarNumber.trim().split(/\s+/);
    if (split.length === 3) return split;
    return [aadhaarNumber, '', ''];
  }, [aadhaarNumber]);

  return (
    <div
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
      }}
      className={`relative inline-block transition-transform duration-300 ${className}`}
    >
      {/* 
        Standard Aadhaar Card Container (ID-1 Format: 85.60mm x 53.98mm)
        Dimensions: 490px x 309px
      */}
      <div
        className={`relative w-[490px] h-[309px] select-none overflow-hidden rounded-[14px] border border-slate-300 bg-[#fbfdfc] text-slate-900 transition-all ${
          interactive
            ? 'hover:shadow-[0_20px_40px_-10px_rgba(15,23,42,0.3)] hover:-translate-y-0.5'
            : ''
        }`}
        style={{
          boxShadow:
            '0 8px 24px -4px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.8) inset, 0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          background: `
            radial-gradient(circle at 50% 50%, #ffffff 0%, #f6faf9 70%, #ecf4f3 100%)
          `,
        }}
      >
        {/* Top Scissors Cut Perforation Guideline */}
        <div className="absolute top-1 inset-x-2 flex items-center justify-between text-slate-400 opacity-60 pointer-events-none text-[9px]">
          <div className="border-b border-dashed border-slate-400/80 flex-1 mr-2" />
          <Scissors className="h-3 w-3 -scale-x-100" />
        </div>

        {/* ----------------- TOP HEADER ----------------- */}
        <div className="pt-2 px-4 flex items-center gap-2.5">
          {/* Left: State Emblem of India with सत्यमेव जयते */}
          <div className="shrink-0 flex flex-col items-center justify-center -ml-1 w-[32px] select-none">
            {!emblemError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="w-[30px] h-[34px] flex items-center justify-center">
                <img
                  src="/images/aadhaar/ashoka-emblem.png?v=2"
                  alt="State Emblem of India"
                  className="max-h-full max-w-full object-contain filter contrast-110 drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.15)]"
                  onError={() => setEmblemError(true)}
                />
              </div>
            ) : (
              <NationalEmblemSvg width={26} height={32} className="text-[#0f172a]" />
            )}
            <span className="text-[4.8px] font-bold text-slate-800 tracking-tight leading-none mt-0.5 whitespace-nowrap">
              सत्यमेव जयते
            </span>
          </div>

          {/* Center: Wavy / Zig-Zag Tricolor Header Ribbon */}
          <div className="flex-1">
            <AadhaarHeaderRibbon
              hindiText="भारत सरकार"
              englishText="Government of India"
            />
          </div>

          {/* Right: Aadhaar Logo */}
          <div className="shrink-0">
            <AadhaarLogoSvg width={46} height={36} />
          </div>
        </div>

        {/* ----------------- BODY: PHOTO, DETAILS, GHOST PHOTO OR QR ----------------- */}
        <div className="px-3 pt-2 pb-0.5 flex items-start gap-2 min-h-[148px]">
          {/* Col 1: Vertical Issue Date + Passport Photo */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Vertical Issue Date */}
            <div className="h-[112px] w-[14px] flex items-center justify-center select-none overflow-visible">
              <span className="text-[7.5px] font-bold text-slate-800 tracking-tight whitespace-nowrap select-none inline-block -rotate-90 origin-center">
                Aadhaar no. issued: {issueDate}
              </span>
            </div>

            {/* Passport Photo Frame */}
            <div className="relative shrink-0 h-[112px] w-[90px] overflow-hidden rounded-[5px] border border-slate-300 bg-slate-100 shadow-sm">
              {!photoError && photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt={nameEnglish}
                  className="h-full w-full object-cover"
                  onError={() => setPhotoError(true)}
                />
              ) : (
                /* Fallback neutral silhouette avatar */
                <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-slate-200 text-slate-500">
                  <svg viewBox="0 0 40 40" className="w-12 h-12 text-slate-400 fill-current">
                    <circle cx="20" cy="14" r="7" />
                    <path d="M 8 36 C 8 28, 14 24, 20 24 C 26 24, 32 28, 32 36 Z" />
                  </svg>
                  <span className="text-[7.5px] font-bold tracking-wider uppercase text-slate-600 mt-1">
                    Photo
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Col 2: Cardholder Details (Bilingual Hindi + English) */}
          <div className="flex-1 min-w-0 space-y-1 text-left">
            {/* Names (Hindi + English) */}
            <div className="leading-tight">
              <p className="text-[12px] font-bold text-slate-900 leading-tight">
                {nameHindi}
              </p>
              <p className="text-[11.5px] font-semibold text-slate-900 tracking-normal leading-tight mt-0.5">
                {nameEnglish}
              </p>
            </div>

            {/* Date of Birth */}
            <div className="pt-0.5 text-[9px] font-bold text-slate-900">
              <span>जन्म तिथि/DOB:{dob}</span>
            </div>

            {/* Gender */}
            <div className="text-[9px] font-bold text-slate-900">
              <span>{genderHindi}/ {gender}</span>
            </div>

            {/* Red Disclaimer Box - fitted to text */}
            <div className="mt-1.5 inline-block w-fit max-w-full border border-[#DC2626] bg-white px-2 py-0.5 rounded text-center">
              <p className="text-[6.5px] font-bold text-slate-900 leading-tight whitespace-nowrap">
                आधार पहचान का प्रमाण है, नागरिकता या जन्मतिथि का नहीं ।
              </p>
              <p className="text-[6px] font-semibold text-slate-700 leading-tight mt-0.5 whitespace-nowrap">
                Aadhaar is proof of identity, not of citizenship or date of birth.
              </p>
            </div>
          </div>

          {/* Col 3: Security Ghost Photo with Aadhaar Number */}
          <div className="shrink-0 flex flex-col items-center justify-center pt-0.5 pr-1">
            <div className="h-[56px] w-[45px] overflow-hidden rounded border border-slate-300 bg-slate-200">
              {!photoError && photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt="Ghost"
                  className="h-full w-full object-cover filter grayscale contrast-125 opacity-90"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-slate-200">
                  <svg viewBox="0 0 40 40" className="w-6 h-6 text-slate-400 fill-current">
                    <circle cx="20" cy="14" r="7" />
                    <path d="M 8 36 C 8 28, 14 24, 20 24 C 26 24, 32 28, 32 36 Z" />
                  </svg>
                </div>
              )}
            </div>
            <span className="text-[6.5px] font-bold font-mono tracking-tight text-slate-900 mt-1">
              {formattedAadhaar}
            </span>
          </div>
        </div>

        {/* ----------------- AADHAAR 12-DIGIT NUMBER - 4-digit grouped compact sans-serif ----------------- */}
        <div className="flex items-center justify-center gap-2.5 pt-0.5 pb-0.5 text-[20px] font-black text-slate-950 font-sans tracking-tight select-none leading-none">
          <span>{aadhaarParts[0]}</span>
          <span>{aadhaarParts[1]}</span>
          <span>{aadhaarParts[2]}</span>
        </div>

        {/* ----------------- RED SEPARATOR BAR ----------------- */}
        <div className="h-[2px] bg-[#DC2626] w-full my-0.5" />

        {/* ----------------- SLOGAN BANNER: मेरा आधार, मेरी पहचान ----------------- */}
        <div className="py-1 text-center flex items-center justify-center gap-1.5">
          <span className="text-[14px] font-bold text-slate-900">मेरा</span>
          <span className="text-[15px] font-black text-[#DC2626] tracking-wide">आधार</span>
          <span className="text-[14px] font-bold text-slate-900">, मेरी पहचान</span>
        </div>

        {/* Micro subtle card edge highlight */}
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-amber-500/40 via-red-500/40 to-emerald-500/40" />
      </div>
    </div>
  );
}
