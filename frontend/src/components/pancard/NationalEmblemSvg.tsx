import React from 'react';

interface NationalEmblemSvgProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

/**
 * High-fidelity Vector Representation of the National Emblem of India
 * (State Emblem: Lion Capital of Ashoka with Satyameva Jayate)
 */
export default function NationalEmblemSvg({
  className = 'w-7 h-9 text-slate-800',
  width = 28,
  height = 36,
}: NationalEmblemSvgProps) {
  return (
    <svg
      viewBox="0 0 100 130"
      width={width}
      height={height}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="State Emblem of India"
    >
      {/* Central Lion Head */}
      <path d="M50 8 C44 8 40 12 40 17 C39 21 42 24 43 28 C41 29 38 31 38 35 C38 41 42 46 45 49 C46 53 48 58 50 62 C52 58 54 53 55 49 C58 46 62 41 62 35 C62 31 59 29 57 28 C58 24 61 21 60 17 C60 12 56 8 50 8 Z" />
      
      {/* Central Lion Facial Features */}
      <circle cx="47" cy="20" r="1.5" fill="#ffffff" />
      <circle cx="53" cy="20" r="1.5" fill="#ffffff" />
      <path d="M49 23 L51 23 L50 26 Z" fill="#ffffff" />
      <path d="M47 28 Q50 30 53 28" stroke="#ffffff" strokeWidth="0.8" fill="none" />
      {/* Mane details */}
      <path d="M42 25 Q46 32 44 40 M58 25 Q54 32 56 40 M46 36 Q50 42 46 50 M54 36 Q50 42 54 50" stroke="#ffffff" strokeWidth="0.8" fill="none" opacity="0.6" />

      {/* Left Lion Profile */}
      <path d="M38 18 C33 16 27 19 25 24 C23 29 25 34 23 38 C21 43 23 48 26 52 C30 56 34 59 38 61 C37 55 37 48 38 42 C36 38 35 32 37 27 C38 23 37 20 38 18 Z" />
      <circle cx="28" cy="26" r="1.2" fill="#ffffff" />
      <path d="M26 31 Q29 32 31 30" stroke="#ffffff" strokeWidth="0.7" fill="none" />
      <path d="M29 37 Q33 42 35 48" stroke="#ffffff" strokeWidth="0.7" fill="none" opacity="0.5" />

      {/* Right Lion Profile */}
      <path d="M62 18 C67 16 73 19 75 24 C77 29 75 34 77 38 C79 43 77 48 74 52 C70 56 66 59 62 61 C63 55 63 48 62 42 C64 38 65 32 63 27 C62 23 63 20 62 18 Z" />
      <circle cx="72" cy="26" r="1.2" fill="#ffffff" />
      <path d="M74 31 Q71 32 69 30" stroke="#ffffff" strokeWidth="0.7" fill="none" />
      <path d="M71 37 Q67 42 65 48" stroke="#ffffff" strokeWidth="0.7" fill="none" opacity="0.5" />

      {/* Chest & Front Paws / Pillar Body */}
      <path d="M35 60 C38 66 43 70 50 70 C57 70 62 66 65 60 C64 68 62 76 60 82 L40 82 C38 76 36 68 35 60 Z" />
      
      {/* Abacus frieze top line */}
      <rect x="22" y="83" width="56" height="3" rx="1.5" />

      {/* Abacus Frieze containing Ashoka Chakra */}
      <rect x="24" y="87" width="52" height="15" rx="1" />
      
      {/* Center Ashoka Chakra wheel in abacus */}
      <circle cx="50" cy="94.5" r="6" fill="#ffffff" stroke="currentColor" strokeWidth="1" />
      <circle cx="50" cy="94.5" r="1.5" fill="currentColor" />
      {/* Spokes of the wheel */}
      {[0, 30, 60, 90, 120, 150].map((deg) => (
        <line
          key={deg}
          x1={50 + 5 * Math.cos((deg * Math.PI) / 180)}
          y1={94.5 + 5 * Math.sin((deg * Math.PI) / 180)}
          x2={50 - 5 * Math.cos((deg * Math.PI) / 180)}
          y2={94.5 - 5 * Math.sin((deg * Math.PI) / 180)}
          stroke="currentColor"
          strokeWidth="0.8"
        />
      ))}

      {/* Galloping Horse (Left of Chakra) */}
      <path d="M30 92 C32 90 35 91 36 94 C37 96 34 98 32 98 C30 98 29 95 30 92 Z" fill="#ffffff" opacity="0.9" />

      {/* Charging Bull (Right of Chakra) */}
      <path d="M68 93 C67 91 64 91 63 94 C62 96 65 98 67 98 C69 98 70 95 68 93 Z" fill="#ffffff" opacity="0.9" />

      {/* Lower Bell-shaped Inverted Lotus Base */}
      <rect x="20" y="103" width="60" height="3" rx="1.5" />
      <path d="M24 107 C30 114 40 116 50 116 C60 116 70 114 76 107 Z" />
      <rect x="18" y="117" width="64" height="2.5" rx="1" />

      {/* Satyameva Jayate (सत्यमेव जयते) Inscription */}
      <text
        x="50"
        y="126"
        fontSize="7.5"
        fontWeight="bold"
        textAnchor="middle"
        letterSpacing="0.04em"
        fill="currentColor"
        fontFamily="sans-serif"
      >
        सत्यमेव जयते
      </text>
    </svg>
  );
}
