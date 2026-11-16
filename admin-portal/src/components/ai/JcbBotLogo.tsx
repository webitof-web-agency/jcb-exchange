import type { SVGProps } from 'react';

export default function JcbBotLogo({ className = 'h-11 w-11 sm:h-[48px] sm:w-[48px]', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="3 1.5 30 24.5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        {/* Headphone Gold 3D Gradient */}
        <linearGradient id="jcbHpGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="40%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>

        {/* Headphone Highlight */}
        <linearGradient id="jcbHpHighlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>

        {/* White Glossy 3D Helmet Gradient */}
        <linearGradient id="jcbHelmet3d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor="#F8FAFC" />
          <stop offset="70%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>

        {/* Visor Deep Black Gradient */}
        <linearGradient id="jcbVisorBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="45%" stopColor="#0A0E1A" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        {/* Glowing Yellow Eyes Gradient */}
        <radialGradient id="jcbEyeRadial" cx="40%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="25%" stopColor="#FEF08A" />
          <stop offset="65%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </radialGradient>

        {/* Eye Luminous Glow Filter */}
        <filter id="jcbEyeGlowFilter" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.2" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Shadow for 3D robot */}
        <filter id="jcbRobotShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter="url(#jcbRobotShadow)">
        {/* Top Headband Arch */}
        <path
          d="M 6.5 16.5 C 6.5 7.5 11.5 3 18 3 C 24.5 3 29.5 7.5 29.5 16.5"
          stroke="url(#jcbHpGold)"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />

        {/* Headband Top Joint Accent */}
        <path
          d="M 17 2.2 L 19 2.2"
          stroke="#FEF08A"
          strokeWidth="1.6"
          strokeLinecap="round"
        />

        {/* Left Ear Cup */}
        <rect x="4" y="12.5" width="4.5" height="9" rx="2.25" fill="url(#jcbHpGold)" />
        <rect x="4.8" y="13.5" width="1.6" height="7" rx="0.8" fill="url(#jcbHpHighlight)" opacity="0.85" />

        {/* Right Ear Cup */}
        <rect x="27.5" y="12.5" width="4.5" height="9" rx="2.25" fill="url(#jcbHpGold)" />
        <rect x="29.6" y="13.5" width="1.6" height="7" rx="0.8" fill="url(#jcbHpHighlight)" opacity="0.85" />

        {/* 3D White Glossy Astronaut Helmet Outer */}
        <rect
          x="8"
          y="7.5"
          width="20"
          height="17.5"
          rx="7.5"
          fill="url(#jcbHelmet3d)"
          stroke="#CBD5E1"
          strokeWidth="0.5"
        />

        {/* Helmet Top Gloss Reflection */}
        <ellipse cx="18" cy="9.8" rx="6" ry="1.5" fill="#FFFFFF" opacity="0.75" />

        {/* Dark Glossy Visor Screen */}
        <rect
          x="10.2"
          y="10.5"
          width="15.6"
          height="11.5"
          rx="4.8"
          fill="url(#jcbVisorBg)"
          stroke="#1E293B"
          strokeWidth="0.7"
        />

        {/* Visor Glass Upper Highlight Curve */}
        <path
          d="M 12 11.6 C 14 11 22 11 24 11.6"
          stroke="#FFFFFF"
          strokeWidth="0.6"
          strokeLinecap="round"
          opacity="0.35"
        />

        {/* Left Glowing Eye */}
        <circle cx="14" cy="15.8" r="2" fill="url(#jcbEyeRadial)" filter="url(#jcbEyeGlowFilter)" />
        <circle cx="13.5" cy="15.3" r="0.55" fill="#FFFFFF" opacity="0.85" />

        {/* Right Glowing Eye */}
        <circle cx="22" cy="15.8" r="2" fill="url(#jcbEyeRadial)" filter="url(#jcbEyeGlowFilter)" />
        <circle cx="21.5" cy="15.3" r="0.55" fill="#FFFFFF" opacity="0.85" />

        {/* Chin/Bottom Helmet Highlight */}
        <path
          d="M 14 24 C 16 24.6 20 24.6 22 24"
          stroke="#FFFFFF"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.5"
        />
      </g>
    </svg>
  );
}
