import React from 'react';

interface AadhaarHeaderRibbonProps {
  hindiText: string;
  englishText: string;
  className?: string;
}

/**
 * Authentic Wavy / Zig-Zag Tricolor Header Ribbon for Aadhaar Card
 * Matches the official UIDAI undulating watercolor flag brushstroke
 * rather than rigid mechanical straight boxes.
 */
export default function AadhaarHeaderRibbon({
  hindiText,
  englishText,
  className = '',
}: AadhaarHeaderRibbonProps) {
  return (
    <div className={`relative w-full overflow-hidden select-none ${className}`}>
      {/* Background SVG Wavy/Zig-Zag Watercolor Flag Ribbon */}
      <svg
        viewBox="0 0 380 44"
        width="100%"
        height="44"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Saffron Ribbon Gradient with natural watercolor falloff */}
          <linearGradient id="aadhaar-saffron-wave" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.35" />
            <stop offset="6%" stopColor="#f97316" stopOpacity="0.8" />
            <stop offset="25%" stopColor="#fb923c" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#f97316" stopOpacity="0.85" />
            <stop offset="78%" stopColor="#fb923c" stopOpacity="0.9" />
            <stop offset="94%" stopColor="#f97316" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0.25" />
          </linearGradient>

          {/* Green Ribbon Gradient with natural watercolor falloff */}
          <linearGradient id="aadhaar-green-wave" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#15803d" stopOpacity="0.3" />
            <stop offset="7%" stopColor="#16a34a" stopOpacity="0.78" />
            <stop offset="28%" stopColor="#22c55e" stopOpacity="0.9" />
            <stop offset="52%" stopColor="#16a34a" stopOpacity="0.82" />
            <stop offset="76%" stopColor="#4ade80" stopOpacity="0.9" />
            <stop offset="93%" stopColor="#16a34a" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#15803d" stopOpacity="0.2" />
          </linearGradient>

          {/* Micro-texture filter for authentic paper ink bleed */}
          <filter id="ribbon-blur" x="-2%" y="-5%" width="104%" height="110%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" />
          </filter>
        </defs>

        {/* 1. TOP SAFFRON WAVE WITH ZIG-ZAG / UNDULATING EDGES */}
        <g filter="url(#ribbon-blur)">
          <path
            d="
              M 2 3
              C 25 1, 45 4, 70 2
              C 95 0, 120 4, 150 2
              C 180 0, 210 3, 240 1
              C 270 0, 300 4, 330 2
              C 350 1, 365 3, 378 1
              L 379 21
              C 362 23, 345 20, 325 22
              C 295 24, 265 21, 235 23
              C 205 25, 175 22, 145 24
              C 115 26, 85 22, 55 24
              C 35 25, 15 22, 2 21
              Z
            "
            fill="url(#aadhaar-saffron-wave)"
          />

          {/* Subtle painterly zig-zag brush ridge (top saffron edge) */}
          <path
            d="
              M 5 2
              Q 20 4, 35 1 Q 50 3, 65 1 Q 80 4, 95 2 Q 110 4, 125 1
              Q 140 3, 155 1 Q 170 4, 185 2 Q 200 4, 215 1 Q 230 3, 245 1
              Q 260 4, 275 2 Q 290 4, 305 1 Q 320 3, 335 1 Q 350 4, 365 2
              Q 372 3, 377 1
            "
            fill="none"
            stroke="#ea580c"
            strokeWidth="0.8"
            opacity="0.4"
          />

          {/* 2. BOTTOM GREEN WAVE WITH ZIG-ZAG / UNDULATING EDGES */}
          <path
            d="
              M 2 22
              C 20 20, 45 23, 75 21
              C 105 19, 135 23, 165 21
              C 195 19, 225 22, 255 20
              C 285 18, 315 22, 345 20
              C 360 19, 370 21, 378 20
              L 377 40
              C 365 42, 345 39, 325 41
              C 295 43, 265 40, 235 42
              C 205 44, 175 41, 145 43
              C 115 45, 85 41, 55 43
              C 35 44, 18 41, 2 40
              Z
            "
            fill="url(#aadhaar-green-wave)"
          />

          {/* Subtle painterly zig-zag brush ridge (bottom green edge) */}
          <path
            d="
              M 5 41
              Q 20 43, 35 40 Q 50 42, 65 40 Q 80 43, 95 41 Q 110 43, 125 40
              Q 140 42, 155 40 Q 170 43, 185 41 Q 200 43, 215 40 Q 230 42, 245 40
              Q 260 43, 275 41 Q 290 43, 305 40 Q 320 42, 335 40 Q 350 43, 365 41
              Q 372 42, 376 40
            "
            fill="none"
            stroke="#15803d"
            strokeWidth="0.8"
            opacity="0.35"
          />

          {/* Right trailing brushstroke accents (extended flag brush taper) */}
          <path
            d="M 374 12 Q 380 14, 386 11 M 372 32 Q 378 34, 384 31"
            fill="none"
            stroke="#22c55e"
            strokeWidth="1.2"
            opacity="0.4"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {/* Foreground Typography Centered on Each Wave Band */}
      <div className="relative z-10 flex flex-col justify-between h-[44px] py-[2px] px-2 text-center">
        {/* Top Hindi Text: भारत सरकार */}
        <div className="h-[20px] flex items-center justify-center">
          <h2 className="text-[13px] font-black tracking-tight text-[#111827] leading-none drop-shadow-[0_0.5px_0.5px_rgba(255,255,255,0.7)]">
            {hindiText}
          </h2>
        </div>

        {/* Bottom English Text: Government of India */}
        <div className="h-[20px] flex items-center justify-center">
          <p className="text-[11px] font-black uppercase tracking-tight text-[#111827] leading-none drop-shadow-[0_0.5px_0.5px_rgba(255,255,255,0.7)]">
            {englishText}
          </p>
        </div>
      </div>
    </div>
  );
}
