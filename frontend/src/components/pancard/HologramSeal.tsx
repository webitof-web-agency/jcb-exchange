import React, { useState } from 'react';

interface HologramSealProps {
  className?: string;
  size?: number;
}

/**
 * Authentic Security Hologram for Indian PAN Card
 * Uses the exact silver-metallic foil texture from real cards with Ashoka Chakra,
 * "भारत सरकार" inscription, and dynamic iridescent light reflections.
 */
export default function HologramSeal({ className = '', size = 52 }: HologramSealProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative select-none overflow-hidden rounded-xl border border-white/70 shadow-sm group ${className}`}
      title="Security Hologram - भारत सरकार"
    >
      {!imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/images/pancard/hologram-seal.png"
          alt="Security Hologram - भारत सरकार"
          className="h-full w-full object-cover filter contrast-110"
          onError={() => setImgError(true)}
        />
      ) : (
        /* Vector fallback if image is not accessible */
        <div className="relative h-full w-full bg-gradient-to-br from-[#c8d6e5] via-[#a4b0be] to-[#747d8c]">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-85">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#2c3e50" strokeWidth="0.8" opacity="0.6" />
            <circle cx="50" cy="50" r="16" fill="none" stroke="#1e272e" strokeWidth="1.2" opacity="0.75" />
            <text x="50" y="46" fontSize="12" fontWeight="bold" textAnchor="middle" fill="#ffffff" stroke="#4b6584" strokeWidth="0.3">
              भारत
            </text>
            <text x="50" y="62" fontSize="12" fontWeight="bold" textAnchor="middle" fill="#ffffff" stroke="#4b6584" strokeWidth="0.3">
              सरकार
            </text>
          </svg>
        </div>
      )}

      {/* Iridescent Light Reflection Overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-200/20 to-purple-200/20 mix-blend-overlay" />
      
      {/* Animated Sheen on Hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
    </div>
  );
}
