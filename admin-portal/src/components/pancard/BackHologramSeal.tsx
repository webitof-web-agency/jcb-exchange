import React from 'react';

interface BackHologramSealProps {
  className?: string;
  size?: number;
}

/**
 * Authentic Rainbow Iridescent Security Hologram for Back of Indian PAN Card
 * Matches the square rounded-corner security foil with State Emblem of India,
 * iridescent rainbow diffraction grating, and repeating security pattern.
 */
export default function BackHologramSeal({ className = '', size = 86 }: BackHologramSealProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative select-none overflow-hidden rounded-[16px] border border-white/80 shadow-md group ${className}`}
      title="Security Hologram - भारत सरकार / Government of India"
    >
      {/* Base Rainbow Holographic Diffraction Foil */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 30% 30%, #fef08a 0%, #86efac 22%, #67e8f9 45%, #a5b4fc 65%, #f472b6 85%, #fde047 100%),
            linear-gradient(135deg, #fef08a 0%, #4ade80 25%, #38bdf8 50%, #c084fc 75%, #fb7185 100%)
          `,
          backgroundBlendMode: 'color-dodge',
        }}
      />

      {/* Holographic Security Micro-Grid Pattern */}
      <svg className="absolute inset-0 h-full w-full opacity-40 mix-blend-overlay" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="back-holo-grid" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="none" stroke="#ffffff" strokeWidth="0.8" />
            <circle cx="4" cy="4" r="1.5" fill="#ffffff" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#back-holo-grid)" />
      </svg>

      {/* Repeating Diagonal "आयकर / INCOME TAX" Hologram Watermark Bands */}
      <div className="absolute inset-0 flex flex-col justify-between py-1 opacity-45 pointer-events-none -rotate-12 scale-125">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex whitespace-nowrap text-[6px] font-black uppercase tracking-widest text-amber-950/70 justify-around">
            <span>आयकर</span>
            <span>INCOME TAX</span>
            <span>GOVT OF INDIA</span>
          </div>
        ))}
      </div>



      {/* Circular Guilloche Ring within Hologram */}
      <svg className="absolute inset-0 h-full w-full pointer-events-none opacity-60" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="43" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="2,2" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="#fef08a" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="28" fill="none" stroke="#ffffff" strokeWidth="1" strokeDasharray="3,1.5" />
      </svg>

      {/* Specular Iridescent Rainbow Flare Overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-cyan-300/30 via-transparent to-pink-300/30 mix-blend-color-dodge" />

      {/* Animated Light Sweep Sheen on Hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
    </div>
  );
}
