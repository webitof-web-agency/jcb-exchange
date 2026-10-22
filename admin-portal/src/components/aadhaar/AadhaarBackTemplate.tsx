'use client';

import React from 'react';
import AadhaarLogoSvg from './AadhaarLogoSvg';
import AadhaarHeaderRibbon from './AadhaarHeaderRibbon';
import { Phone, Mail, Globe, Scissors } from 'lucide-react';

export interface AadhaarBackTemplateProps {
  aadhaarNumber?: string;
  addressHindi?: string;
  addressEnglish?: string;
  className?: string;
  scale?: number;
  interactive?: boolean;
}

function formatAadhaarNumber(num?: string): string {
  if (!num) return '2943 6593 3461';
  const clean = num.replace(/\D/g, '');
  if (clean.length === 12) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)}`;
  }
  return num;
}

/**
 * 1:1 Pixel-Perfect Authentic UIDAI Aadhaar Card Reverse / Back Side
 * ID-1 Format: 85.60mm x 53.98mm (Dimensions: 490px x 309px)
 * Matches the official UIDAI cut-out Aadhaar card back:
 * - UIDAI Fingerprint & Sun logo
 * - Saffron & Green tricolor header bands
 * - Dual-column bilingual address (Hindi left, English right)
 * - Prominent 12-digit Aadhaar number
 * - Red separator bar
 * - Official 1947 helpline, email, and www.uidai.gov.in portal footer
 */
export default function AadhaarBackTemplate({
  aadhaarNumber = '2943 6593 3461',
  addressHindi = 'सरायं दान शाह, कतरौली, पूरे दुर्गी, फूलपुर, इलाहाबाद, उत्तर प्रदेश, 212402',
  addressEnglish = 'saray dan shah, KATRAULI, Poore Durgi, Phoolpur, Allahabad, Uttar Pradesh, 212402',
  className = '',
  scale = 1,
  interactive = true,
}: AadhaarBackTemplateProps) {
  const formattedAadhaar = formatAadhaarNumber(aadhaarNumber);

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
        data-aadhaar-card-surface="back"
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
        <div className="pt-2.5 px-4 flex items-center gap-2.5">
          {/* Left: UIDAI Aadhaar Fingerprint Logo */}
          <div className="shrink-0 flex items-center justify-center -ml-1">
            <AadhaarLogoSvg width={54} height={42} />
          </div>

          {/* Right: Wavy / Zig-Zag Tricolor Header Ribbon */}
          <div className="flex-1">
            <AadhaarHeaderRibbon
              hindiText="भारतीय विशिष्ट पहचान प्राधिकरण"
              englishText="Unique Identification Authority of India"
            />
          </div>
        </div>

        {/* ----------------- BODY: BILINGUAL ADDRESS ----------------- */}
        <div className="px-5 pt-3 pb-1 grid grid-cols-2 gap-4 items-start min-h-[142px]">
          {/* Left Column: Hindi Address */}
          <div className="text-left leading-[1.38]">
            <p className="text-[9.5px] font-bold text-slate-900 mb-0.5">
              पता:
            </p>
            <p className="text-[9px] font-medium text-slate-800 leading-[1.38]">
              {addressHindi}
            </p>
          </div>

          {/* Right Column: English Address */}
          <div className="text-left leading-[1.38]">
            <p className="text-[9.5px] font-bold text-slate-900 mb-0.5">
              Address:
            </p>
            <p className="text-[9px] font-medium text-slate-800 leading-[1.38]">
              {addressEnglish}
            </p>
          </div>
        </div>

        {/* ----------------- AADHAAR 12-DIGIT NUMBER ----------------- */}
        <div className="text-center pt-0.5 pb-1">
          <p
            className="text-[19px] font-black tracking-[0.16em] text-slate-950 font-mono"
            style={{ fontFeatureSettings: '"tnum" 1' }}
          >
            {formattedAadhaar}
          </p>
        </div>

        {/* ----------------- RED SEPARATOR BAR ----------------- */}
        <div className="mx-2 h-[2px] bg-[#E31E24]" />

        {/* ----------------- FOOTER: OFFICIAL UIDAI HELPLINES ----------------- */}
        <div className="px-5 py-2 grid grid-cols-3 gap-2 items-center text-center">
          {/* Col 1: Toll Free Phone */}
          <div className="flex flex-col items-center justify-center text-slate-700">
            <div className="flex items-center gap-1">
              <Phone className="h-2.5 w-2.5 text-slate-800" />
              <span className="text-[8.5px] font-black text-slate-900">1947</span>
            </div>
            <span className="text-[7.5px] font-medium text-slate-600 mt-0.5">1800 300 1947</span>
          </div>

          {/* Col 2: Email Helpline */}
          <div className="flex flex-col items-center justify-center text-slate-700">
            <Mail className="h-3 w-3 text-slate-800 mb-0.5" />
            <span className="text-[8px] font-bold text-slate-800">help@uidai.gov.in</span>
          </div>

          {/* Col 3: Website Portal */}
          <div className="flex flex-col items-center justify-center text-slate-700">
            <div className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-white">
              <Globe className="h-2 w-2" />
              <span className="text-[7.5px] font-black tracking-wider uppercase">www</span>
            </div>
            <span className="text-[8px] font-bold text-slate-800 mt-0.5">www.uidai.gov.in</span>
          </div>
        </div>

        {/* Micro subtle card edge highlight */}
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-amber-500/40 via-red-500/40 to-emerald-500/40" />
      </div>
    </div>
  );
}
