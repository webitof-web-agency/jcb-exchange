'use client';

import React from 'react';
import BackHologramSeal from './BackHologramSeal';
import GuillochePatternSvg from './GuillochePatternSvg';

export interface PanCardBackTemplateProps {
  className?: string;
  scale?: number;
  interactive?: boolean;
}

/**
 * 1:1 Pixel-Perfect Authentic Indian PAN Card Reverse / Back Side
 * ID-1 Format: 85.60mm x 53.98mm (Dimensions: 490px x 309px)
 * Matches the official Income Tax Department / NSDL PAN card back:
 * - Bilingual lost/found advisory (Hindi & English)
 * - Official NSDL Pune processing unit address
 * - Contact telephone, fax, and email
 * - Large square iridescent rainbow security hologram
 * - Guilloché security pattern and PVC card specular sheen
 */
export default function PanCardBackTemplate({
  className = '',
  scale = 1,
  interactive = true,
}: PanCardBackTemplateProps) {
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
          boxShadow:
            '0 10px 25px -5px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.7) inset, 0 1px 3px 0 rgba(0, 0, 0, 0.12)',
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

        {/* Layer 2: PVC Card Specular Glare Overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background:
              'linear-gradient(118deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.1) 28%, transparent 55%)',
          }}
        />

        {/* ----------------- CARD CONTENT ----------------- */}
        <div className="relative z-10 h-full flex flex-col justify-between p-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            {/* LEFT COLUMN: Bilingual Lost/Found Notice & Address */}
            <div className="max-w-[340px] text-left">
              {/* Hindi Notice & Address */}
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-[#0f172a] leading-tight tracking-tight">
                  इस कार्ड के खोने/पाने पर कृपया सूचित करें/लौटाएं :
                </p>
                <div className="text-[8.5px] font-bold text-[#1e293b] leading-[1.3] pl-0.5">
                  <p>आयकर पैन सेवा इकाई, एन एस डी एल</p>
                  <p>चौथी मंजिल, मंत्री स्टर्लिंग,</p>
                  <p>प्लॉट नं. 341, सर्वे नं. 997/8,</p>
                  <p>मॉडल कालोनी, दीप बंगला चौक के पास,</p>
                  <p>पुणे - 411 016.</p>
                </div>
              </div>

              {/* English Notice & Address */}
              <div className="mt-2.5 space-y-0.5">
                <p className="text-[9.5px] font-serif italic font-bold text-[#0f172a] leading-tight">
                  If this card is lost / someone&apos;s lost card is found,
                  <br />
                  please inform / return to :
                </p>
                <div className="text-[8.5px] font-semibold text-[#1e293b] leading-[1.35] pl-0.5">
                  <p className="font-bold">Income Tax PAN Services Unit, NSDL</p>
                  <p>4th Floor, Mantri Sterling,</p>
                  <p>Plot No. 341, Survey No. 997/8,</p>
                  <p>Model Colony, Near Deep Bungalow Chowk,</p>
                  <p>Pune - 411 016.</p>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Square Iridescent Security Hologram */}
            <div className="shrink-0 pt-1 pr-1">
              <BackHologramSeal size={88} />
            </div>
          </div>

          {/* BOTTOM LEFT: Contact Telephone, Fax & Email */}
          <div className="text-[8.5px] font-bold text-[#0f172a] space-y-0.5 pt-1 pl-0.5 border-t border-sky-400/30">
            <p className="tracking-tight">
              <span className="font-semibold text-slate-700">Tel:</span> 91-20-2721 8080,&nbsp;&nbsp;
              <span className="font-semibold text-slate-700">Fax:</span> 91-20-2721 8081
            </p>
            <p className="tracking-tight">
              <span className="font-semibold text-slate-700">e-mail:</span> tininfo@nsdl.co.in
            </p>
          </div>
        </div>

        {/* Bottom subtle edge line */}
        <div className="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-sky-400/50 via-indigo-500/40 to-sky-400/50" />
      </div>
    </div>
  );
}
