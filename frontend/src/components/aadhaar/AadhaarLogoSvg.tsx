'use client';

import React, { useState } from 'react';

export interface AadhaarLogoSvgProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

/**
 * Official UIDAI Aadhaar Logo
 * Uses the authentic official Aadhaar Logo (aadhaar.svg.webp)
 * with multi-source fallback support for WebP, PNG, and vector SVG.
 */
export default function AadhaarLogoSvg({
  className = '',
  width = 64,
  height = 50,
}: AadhaarLogoSvgProps) {
  const [imgError, setImgError] = useState(false);

  if (!imgError) {
    return (
      <div
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: typeof height === 'number' ? `${height}px` : height,
        }}
        className={`inline-flex items-center justify-center select-none ${className}`}
      >
        <picture>
          <source srcSet="/images/aadhaar/aadhaar-logo-trimmed.webp" type="image/webp" />
          <source srcSet="/images/aadhaar/aadhaar.svg.webp" type="image/webp" />
          <source srcSet="/images/aadhaar/aadhaar-logo-trimmed.png" type="image/png" />
          <source srcSet="/images/aadhaar/aadhaar-logo.png" type="image/png" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/aadhaar/aadhaar.svg.webp"
            alt="UIDAI Aadhaar Logo"
            className="max-h-full max-w-full object-contain filter drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.06)]"
            onError={() => setImgError(true)}
          />
        </picture>
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 100 80"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
      aria-label="UIDAI Aadhaar Logo"
    >
      {/* Fallback Vector SVG */}
      <g fill="#F59E0B" opacity="0.95">
        {[20, 40, 60, 80, 100, 120, 140, 160].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const cx = 50;
          const cy = 48;
          const r1 = 30;
          const r2 = 42;
          return (
            <line
              key={angle}
              x1={cx - r1 * Math.cos(rad)}
              y1={cy - r1 * Math.sin(rad)}
              x2={cx - r2 * Math.cos(rad)}
              y2={cy - r2 * Math.sin(rad)}
              stroke="#F59E0B"
              strokeWidth="4"
              strokeLinecap="round"
            />
          );
        })}
      </g>

      <g fill="none" stroke="#DC2626" strokeWidth="2.8" strokeLinecap="round">
        <path d="M 45 44 C 45 40, 55 40, 55 44 C 55 48, 52 50, 50 52" />
        <path d="M 40 44 C 40 35, 60 35, 60 44 C 60 50, 55 53, 52 56" />
        <path d="M 35 45 C 35 30, 65 30, 65 45 C 65 52, 58 56, 54 59" />
        <path d="M 30 46 C 30 25, 70 25, 70 46 C 70 54, 62 58, 56 61" />
        <path d="M 26 48 C 26 21, 74 21, 74 48 C 74 56, 66 60, 58 63" />
      </g>

      <text
        x="50"
        y="75"
        fill="#DC2626"
        fontSize="13"
        fontWeight="bold"
        textAnchor="middle"
        fontFamily="'Noto Sans Devanagari', 'Mangal', 'Segoe UI', sans-serif"
        letterSpacing="0.05em"
      >
        आधार
      </text>
    </svg>
  );
}
