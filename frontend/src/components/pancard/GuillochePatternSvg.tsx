import React from 'react';

/**
 * Authentic Security Guilloché Pattern for Indian PAN Card
 * Produces mathematical sine-wave interlaced security lines and rosette curves
 * characteristic of currency and official government identity documents.
 */
export default function GuillochePatternSvg({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 490 309"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className={`pointer-events-none select-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Repeating fine security wave */}
        <pattern id="pan-micro-wave" width="30" height="12" patternUnits="userSpaceOnUse">
          <path
            d="M 0 6 Q 7.5 0 15 6 T 30 6"
            fill="none"
            stroke="#1e3a8a"
            strokeWidth="0.4"
            opacity="0.14"
          />
          <path
            d="M 0 12 Q 7.5 6 15 12 T 30 12"
            fill="none"
            stroke="#581c87"
            strokeWidth="0.35"
            opacity="0.12"
          />
        </pattern>

        {/* Concentric Guilloche Ring Gradients */}
        <linearGradient id="guilloche-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4338ca" stopOpacity="0.18" />
          <stop offset="50%" stopColor="#0284c7" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      {/* Base micro-wave mesh across entire card */}
      <rect width="490" height="309" fill="url(#pan-micro-wave)" />

      {/* Intricate Geometric Rosette 1 (Centered under details) */}
      <g transform="translate(245, 160)" stroke="url(#guilloche-grad-1)" fill="none" strokeWidth="0.5">
        {[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165].map((deg) => (
          <ellipse
            key={deg}
            cx="0"
            cy="0"
            rx="110"
            ry="42"
            transform={`rotate(${deg})`}
            opacity="0.35"
          />
        ))}
      </g>

      {/* Intricate Geometric Rosette 2 (Left side under photo & details) */}
      <g transform="translate(130, 140)" stroke="#1e40af" fill="none" strokeWidth="0.4" opacity="0.22">
        {[0, 20, 40, 60, 80, 100, 120, 140, 160].map((deg) => (
          <ellipse
            key={deg}
            cx="0"
            cy="0"
            rx="85"
            ry="28"
            transform={`rotate(${deg})`}
          />
        ))}
      </g>

      {/* Intricate Geometric Rosette 3 (Right side under QR & Hologram) */}
      <g transform="translate(410, 180)" stroke="#0369a1" fill="none" strokeWidth="0.4" opacity="0.2">
        {[0, 30, 60, 90, 120, 150].map((deg) => (
          <ellipse
            key={deg}
            cx="0"
            cy="0"
            rx="75"
            ry="25"
            transform={`rotate(${deg})`}
          />
        ))}
      </g>

      {/* Top Banner Swirl Accent */}
      <path
        d="M 10 45 C 100 35, 200 55, 245 42 C 290 30, 380 50, 480 40"
        fill="none"
        stroke="#1e3a8a"
        strokeWidth="0.6"
        opacity="0.25"
      />
      <path
        d="M 10 49 C 100 39, 200 59, 245 46 C 290 34, 380 54, 480 44"
        fill="none"
        stroke="#6d28d9"
        strokeWidth="0.5"
        opacity="0.2"
      />
    </svg>
  );
}
