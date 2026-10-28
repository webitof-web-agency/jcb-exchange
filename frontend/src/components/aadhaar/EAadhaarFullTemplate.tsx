'use client';

import React, { useMemo } from 'react';
import AadhaarLogoSvg from './AadhaarLogoSvg';
import AadhaarHeaderRibbon from './AadhaarHeaderRibbon';
import { Scissors } from 'lucide-react';

export interface EAadhaarData {
  aadhaarNumber?: string;
  vid?: string;
  enrolmentNo?: string;
  issueDate?: string;
  nameHindi?: string;
  nameEnglish?: string;
  careOf?: string;
  vtc?: string;
  po?: string;
  subDistrict?: string;
  district?: string;
  state?: string;
  pinCode?: string;
  mobile?: string;
  dob?: string;
  gender?: string;
  genderHindi?: string;
  photoUrl?: string;
  qrData?: string;
  qrUrl?: string;
}

export interface EAadhaarFullTemplateProps {
  data?: EAadhaarData | null;
  className?: string;
  scale?: number;
  interactive?: boolean;
}

function formatAadhaar(num?: string): string {
  if (!num) return '1234 5678 9101';
  const clean = num.replace(/\D/g, '');
  if (clean.length === 12) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)}`;
  }
  return num;
}

function formatVid(vid?: string): string {
  if (!vid) return '9110 0445 8669 0808';
  const clean = vid.replace(/\D/g, '');
  if (clean.length === 16) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)} ${clean.slice(12, 16)}`;
  }
  return vid;
}

function getAadhaarParts(aadhaarNumber: string) {
  const clean = aadhaarNumber.replace(/\D/g, '');
  if (clean.length === 12) {
    return [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)];
  }
  const split = aadhaarNumber.trim().split(/\s+/);
  if (split.length === 3) return split;
  return [aadhaarNumber, '', ''];
}

/**
 * 1D Vector Barcode Generator for e-Aadhaar
 */
function VectorBarcode({ value = '123456789101', width = 160, height = 28 }: { value?: string; width?: number; height?: number }) {
  const bars = useMemo(() => {
    const pattern: number[] = [2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 2, 1, 1, 3, 1, 2, 1, 2, 3, 1, 1, 2, 2, 1, 3, 1, 2];
    return pattern;
  }, []);

  let currentX = 0;
  return (
    <svg width={width} height={height} viewBox="0 0 160 28" className="select-none pointer-events-none">
      {bars.map((w, idx) => {
        const x = currentX;
        currentX += w * 2.2 + 1.2;
        if (currentX > 158) return null;
        return <rect key={idx} x={x} y="0" width={w * 1.5} height={height} fill="#0f172a" />;
      })}
    </svg>
  );
}

/**
 * 1:1 Pixel-Perfect Authentic Official e-Aadhaar Full Sheet Template
 * Matches the downloaded UIDAI PDF/Letter format exactly:
 * - Top National Emblem & UIDAI Logo header
 * - Solid Saffron & Green Bilingual Department Banner
 * - Enrolment Number Bar
 * - Recipient Details, Hierarchy Address, Mobile & 1D Barcode
 * - Large Secure High-Density 2D QR Code
 * - Central Aadhaar & VID Slogan Banner
 * - Scissor Cut Perforation Line
 * - Bottom Cut-out Wallet Card with Ghost Image, Issue Date & Red Disclaimer Box
 */
export default function EAadhaarFullTemplate({
  data,
  className = '',
  scale = 1,
  interactive = true,
}: EAadhaarFullTemplateProps) {
  const [photoError, setPhotoError] = React.useState(false);

  const aadhaarNumber = formatAadhaar(data?.aadhaarNumber || '1234 5678 9101');
  const vid = formatVid(data?.vid || '9110 0445 8669 0808');
  const enrolmentNo = data?.enrolmentNo || '4049/30507/00690';
  const issueDate = data?.issueDate || '10/07/2025';

  const nameHindi = data?.nameHindi || 'बसंत राज';
  const nameEnglish = data?.nameEnglish || 'Basant Raj';
  const careOf = data?.careOf || 'Aadhar Card';
  const vtc = data?.vtc || 'Flat No 25';
  const po = data?.po || 'Grugram';
  const subDistrict = data?.subDistrict || 'Grugram';
  const district = data?.district || 'Grugram';
  const state = data?.state || 'New Delhi';
  const pinCode = data?.pinCode || '110042';
  const mobile = data?.mobile || '9931971873';

  const dob = data?.dob || '01/01/2000';
  const gender = data?.gender || 'MALE';
  const genderHindi = data?.genderHindi || (gender.toLowerCase().startsWith('f') ? 'महिला' : 'पुरुष');
  const photoUrl = data?.photoUrl || '';

  const aadhaarParts = getAadhaarParts(aadhaarNumber);

  return (
    <div
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
      }}
      className={`relative inline-block transition-transform duration-300 ${className}`}
    >
      {/* 
        Full Official e-Aadhaar Sheet
        Dimensions: 490px x 940px (Vertical letter proportions)
      */}
      <div
        className={`relative w-[490px] select-none overflow-hidden rounded-[16px] border border-slate-300 bg-white text-slate-900 shadow-2xl transition-all ${
          interactive ? 'hover:shadow-[0_25px_50px_-12px_rgba(15,23,42,0.35)]' : ''
        }`}
        style={{
          boxShadow: '0 12px 36px -6px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
      >
        {/* ============================================================== */}
        {/* PART 1: TOP LETTERHEAD & LOGOS                                  */}
        {/* ============================================================== */}
        <div className="pt-3 px-6 pb-2 bg-white flex items-center justify-between">
          {/* Left: Ashoka Lion Capital with सत्यमेव जयते & भारत सरकार */}
          <div className="flex flex-col items-center select-none">
            <div className="w-[32px] h-[36px] flex items-center justify-center">
              <img
                src="/images/aadhaar/ashoka-emblem.png?v=2"
                alt="State Emblem of India"
                className="max-h-full max-w-full object-contain filter contrast-110 drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.12)]"
              />
            </div>
            <span className="text-[5.5px] font-bold text-slate-800 tracking-tight leading-none mt-0.5 whitespace-nowrap">
              सत्यमेव जयते
            </span>
            <span className="text-[9px] font-bold text-slate-900 tracking-normal leading-tight mt-0.5 whitespace-nowrap">
              भारत सरकार
            </span>
          </div>

          {/* Right: UIDAI Aadhaar Logo with आधार */}
          <div className="flex flex-col items-center">
            <AadhaarLogoSvg width={72} height={52} />
          </div>
        </div>

        {/* ============================================================== */}
        {/* PART 2: SOLID SAFFRON & GREEN BILINGUAL BANNERS                */}
        {/* ============================================================== */}
        {/* Saffron Banner */}
        <div className="bg-[#f06122] py-1.5 px-4 text-center mb-1.5">
          <h2 className="text-[17px] font-bold text-white tracking-wide leading-tight">
            भारत सरकार
          </h2>
          <p className="text-[14px] font-semibold text-white tracking-wide leading-tight mt-0.5">
            Government of India
          </p>
        </div>

        {/* Green Banner */}
        <div className="bg-[#249e49] py-1.5 px-4 text-center">
          <h3 className="text-[15px] font-bold text-white tracking-wide leading-tight">
            भारतीय विशिष्ट पहचान प्राधिकरण
          </h3>
          <p className="text-[13px] font-semibold text-white tracking-wide leading-tight mt-0.5">
            Unique Identification Authority of India
          </p>
        </div>

        {/* Enrolment Number Line */}
        <div className="pt-2 px-10 pb-1 text-center">
          <p className="text-[11.5px] font-bold text-slate-900 font-mono">
            नामांकन क्रम/ Enrolment No.: {enrolmentNo}
          </p>
        </div>

        {/* ============================================================== */}
        {/* PART 3: RECIPIENT DETAILS, ADDRESS, BARCODE & LARGE QR CODE   */}
        {/* ============================================================== */}
        <div className="px-9 pt-3 pb-4 grid grid-cols-12 gap-3 items-end">
          {/* Left Column (7 cols): To, Names, Hierarchy Address, Mobile, 1D Barcode */}
          <div className="col-span-7 text-left space-y-0.5">
            <p className="text-[11px] font-semibold text-slate-700">To</p>
            <p className="text-[13px] font-bold text-slate-950 leading-tight">{nameHindi}</p>
            <p className="text-[13px] font-bold text-slate-950 leading-tight">{nameEnglish}</p>
            <div className="text-[10px] font-medium text-slate-800 leading-[1.35] pt-0.5 space-y-0.5">
              <p>C/O: {careOf}</p>
              <p>VTC: {vtc}</p>
              <p>PO: {po}</p>
              <p>Sub District: {subDistrict}</p>
              <p>District: {district}</p>
              <p>State: {state}</p>
              <p>PIN Code: {pinCode}</p>
              <p className="font-semibold text-slate-900">Mobile: {mobile}</p>
            </div>

            {/* 1D Vertical Stripe Barcode */}
            <div className="pt-2">
              <VectorBarcode value={aadhaarNumber} width={160} height={30} />
            </div>
          </div>

          {/* Right Column (5 cols): Large Authentic High-Density 2D Secure QR Code - aligned to bottom mark */}
          <div className="col-span-5 flex flex-col items-end justify-end self-stretch">
            <div className="w-[175px] h-[175px] bg-white p-1 rounded border border-slate-200/90 flex items-center justify-center select-none shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data?.qrUrl || '/images/aadhaar/aadhaar-secure-qr.png'}
                alt="UIDAI Aadhaar Secure QR Code"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* PART 4: CENTRAL AADHAAR NUMBER & VID BANNER                     */}
        {/* ============================================================== */}
        <div className="px-10 pt-1 pb-3 text-center">
          <p className="text-[13px] font-bold text-slate-800">
            आपका <span className="text-[#DC2626]">आधार</span> क्रमांक / Your{' '}
            <span className="text-[#DC2626]">Aadhaar</span> No. :
          </p>

          {/* 12-Digit Aadhaar Number - 4-digit grouped compact sans-serif matching Image 4 */}
          <div className="flex items-center justify-center gap-3.5 my-1 text-[27px] font-black text-slate-950 font-sans tracking-tight select-none leading-none">
            <span>{aadhaarParts[0]}</span>
            <span>{aadhaarParts[1]}</span>
            <span>{aadhaarParts[2]}</span>
          </div>

          <div className="mx-auto max-w-[280px] border-b border-dashed border-slate-400/80 my-1" />

          <p className="text-[11px] font-bold text-slate-900 font-mono tracking-wider">
            VID : {vid}
          </p>

          {/* Slogan */}
          <div className="mt-2.5 text-center flex items-center justify-center gap-1.5">
            <span className="text-[18px] font-bold text-slate-900">मेरा</span>
            <span className="text-[19px] font-black text-[#DC2626] tracking-wide">आधार</span>
            <span className="text-[18px] font-bold text-slate-900">, मेरी पहचान</span>
          </div>
        </div>

        {/* ============================================================== */}
        {/* PART 5: RED SEPARATOR & SCISSOR CUT PERFORATION LINE           */}
        {/* ============================================================== */}
        <div className="relative">
          {/* Thin Red Border */}
          <div className="h-[2px] bg-[#E31E24]" />

          {/* Dashed Cut Guideline with Scissor Icon */}
          <div className="py-1 px-3 flex items-center justify-between text-slate-500 text-[10px]">
            <div className="border-b-2 border-dashed border-slate-400 flex-1 mr-2" />
            <Scissors className="h-4 w-4 -scale-x-100 text-slate-700 shrink-0" />
          </div>
        </div>

        {/* PART 6: BOTTOM CUT-OUT WALLET CARD                              */}
        {/* ============================================================== */}
        <div className="relative bg-[#fbfdfc] p-4 pt-2">
          <div>
            {/* Wallet Card Header: Emblem + Wavy Flag Ribbon + Aadhaar Logo */}
            <div className="flex items-center gap-2">
              {/* Left: Ashoka Emblem with सत्यमेव जयते */}
              <div className="shrink-0 flex flex-col items-center justify-center select-none">
                <div className="w-[26px] h-[30px] flex items-center justify-center">
                  <img
                    src="/images/aadhaar/ashoka-emblem.png?v=2"
                    alt="Emblem"
                    className="max-h-full max-w-full object-contain filter contrast-110 drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.12)]"
                  />
                </div>
                <span className="text-[4.5px] font-bold text-slate-800 tracking-tight leading-none mt-0.5 whitespace-nowrap">
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

              {/* Right: Small Aadhaar Logo */}
              <div className="shrink-0">
                <AadhaarLogoSvg width={46} height={36} />
              </div>
            </div>

            {/* Wallet Card Body: Photo, Details, Ghost Photo */}
            <div className="pt-2.5 flex items-start gap-2.5">
              {/* Left Column: Vertical Issue Date + Photo Frame */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Vertical Issue Date - neatly aligned along the height of the photo */}
                <div className="h-[106px] w-[14px] flex items-center justify-center select-none overflow-visible">
                  <span
                    className="text-[7.5px] font-bold text-slate-800 tracking-tight whitespace-nowrap select-none inline-block -rotate-90 origin-center"
                  >
                    Aadhaar no. issued: {issueDate}
                  </span>
                </div>

                {/* Photo Frame */}
                <div className="relative shrink-0 h-[106px] w-[86px] overflow-hidden rounded-[4px] border border-slate-300 bg-slate-200 shadow-xs">
                  {!photoError && photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt={nameEnglish}
                      className="h-full w-full object-cover"
                      onError={() => setPhotoError(true)}
                    />
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-100 to-slate-300 text-slate-500">
                      <svg viewBox="0 0 40 40" className="w-10 h-10 text-slate-400 fill-current">
                        <circle cx="20" cy="14" r="7" />
                        <path d="M 8 36 C 8 28, 14 24, 20 24 C 26 24, 32 28, 32 36 Z" />
                      </svg>
                      <span className="text-[7px] font-bold uppercase tracking-wider text-slate-600 mt-0.5">
                        Photo
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Middle: Details & Red Disclaimer Box */}
              <div className="flex-1 min-w-0 space-y-1 text-left">
                <p className="text-[12.5px] font-bold text-slate-900 leading-tight">{nameHindi}</p>
                <p className="text-[12px] font-semibold text-slate-900 leading-tight">{nameEnglish}</p>
                <p className="text-[9.5px] font-bold text-slate-900 leading-tight pt-0.5">
                  जन्म तिथि/DOB: {dob}
                </p>
                <p className="text-[9.5px] font-bold text-slate-900 leading-tight">
                  {genderHindi} / {gender}
                </p>

                {/* Red Disclaimer Box - fitted to text */}
                <div className="mt-2 inline-block w-fit max-w-full border border-[#DC2626] bg-white px-2 py-0.5 rounded text-center">
                  <p className="text-[6.8px] font-bold text-slate-900 leading-tight whitespace-nowrap">
                    आधार पहचान का प्रमाण है, नागरिकता या जन्मतिथि का नहीं ।
                  </p>
                  <p className="text-[6px] font-semibold text-slate-700 leading-tight mt-0.5 whitespace-nowrap">
                    Aadhaar is proof of identity, not of citizenship or date of birth.
                  </p>
                </div>
              </div>

              {/* Right: Security Ghost Photo with Aadhaar Number */}
              <div className="shrink-0 flex flex-col items-center justify-center">
                <div className="h-[58px] w-[46px] overflow-hidden rounded border border-slate-300 bg-slate-200">
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
                  {aadhaarNumber}
                </span>
              </div>
            </div>

            {/* Bottom Large Aadhaar Number - 4-digit grouped compact sans-serif */}
            <div className="flex items-center justify-center gap-2.5 pt-2 pb-0.5 text-[21px] font-black text-slate-950 font-sans tracking-tight select-none leading-none">
              <span>{aadhaarParts[0]}</span>
              <span>{aadhaarParts[1]}</span>
              <span>{aadhaarParts[2]}</span>
            </div>

            {/* Red Separator Bar */}
            <div className="h-[2px] bg-[#DC2626] w-full my-1.5" />

            {/* Bottom Slogan */}
            <div className="py-1 text-center flex items-center justify-center gap-1.5">
              <span className="text-[15px] font-bold text-slate-900">मेरा</span>
              <span className="text-[16px] font-black text-[#DC2626] tracking-wide">आधार</span>
              <span className="text-[15px] font-bold text-slate-900">, मेरी पहचान</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
