'use client';

import React from 'react';
import { useSiteLogo } from '@/hooks/useSiteLogo';

export type BrandLoaderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type BrandLoaderVariant = 'inline' | 'section' | 'overlay' | 'fullscreen';
export type BrandLoaderBg = 'dark' | 'light';

export interface BrandLoaderProps {
  size?: BrandLoaderSize;
  variant?: BrandLoaderVariant;
  bg?: BrandLoaderBg;
  text?: string;
  initialLogoUrl?: string | null;
  className?: string;
}

const SIZE_MAP: Record<BrandLoaderSize, { ring: number; logo: number; strokeW: number; textSize: string }> = {
  xs: { ring: 40, logo: 0, strokeW: 3.5, textSize: '11px' },
  sm: { ring: 64, logo: 28, strokeW: 4, textSize: '12px' },
  md: { ring: 96, logo: 42, strokeW: 5, textSize: '14px' },
  lg: { ring: 132, logo: 58, strokeW: 6, textSize: '14px' },
  xl: { ring: 172, logo: 76, strokeW: 7, textSize: '16px' },
};

const JCB_YELLOW = '#FFC107';

function ArcRing({ size, bg }: { size: BrandLoaderSize; bg: BrandLoaderBg }) {
  const { ring, strokeW } = SIZE_MAP[size];
  const radius = (ring - strokeW * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;

  return (
    <svg
      width={ring}
      height={ring}
      viewBox={`0 0 ${ring} ${ring}`}
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, transform: 'rotate(-90deg)' }}
    >
      <circle
        cx={ring / 2}
        cy={ring / 2}
        r={radius}
        fill="none"
        stroke={bg === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      <circle
        cx={ring / 2}
        cy={ring / 2}
        r={radius}
        fill="none"
        stroke={JCB_YELLOW}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${arcLength} ${circumference - arcLength}`}
        style={{ animation: 'portalBrandSpin 1s linear infinite', transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    </svg>
  );
}

function LoaderLogo({ ring, logo, logoUrl, darkLogoUrl, initialLogoUrl }: { ring: number; logo: number; logoUrl: string | null; darkLogoUrl: string | null; initialLogoUrl?: string | null }) {
  const activeLogoUrl = initialLogoUrl || darkLogoUrl || logoUrl;
  const [remoteLogoUrl, setRemoteLogoUrl] = React.useState(activeLogoUrl);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!activeLogoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/icon.svg"
          alt=""
          aria-hidden="true"
          style={{ width: Math.min(logo, ring * 0.34), height: Math.min(logo, ring * 0.34), objectFit: 'contain', display: 'block' }}
        />
      )}
      {remoteLogoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={remoteLogoUrl}
          alt="JCB Exchange"
          fetchPriority="high"
          decoding="async"
          onError={() => {
            if (darkLogoUrl && logoUrl && remoteLogoUrl === darkLogoUrl) {
              setRemoteLogoUrl(logoUrl);
              return;
            }
            setRemoteLogoUrl(null);
          }}
          style={{ width: 'auto', height: 'auto', maxWidth: ring * 0.76, maxHeight: ring * 0.46, objectFit: 'contain', display: 'block' }}
        />
      )}
    </div>
  );
}

function Spinner({ size, bg, initialLogoUrl }: { size: BrandLoaderSize; bg: BrandLoaderBg; initialLogoUrl?: string | null }) {
  const { logoUrl, darkLogoUrl } = useSiteLogo();
  const { ring, logo } = SIZE_MAP[size];

  return (
    <div style={{ position: 'relative', width: ring, height: ring, flexShrink: 0 }} role="status" aria-label="Loading">
      <ArcRing size={size} bg={bg} />
      {size !== 'xs' && (
        <LoaderLogo
          key={initialLogoUrl || darkLogoUrl || logoUrl || 'fallback'}
          ring={ring}
          logo={logo}
          logoUrl={logoUrl}
          darkLogoUrl={darkLogoUrl}
          initialLogoUrl={initialLogoUrl}
        />
      )}
    </div>
  );
}

function ResponsiveSpinner({ size, bg, initialLogoUrl }: { size: BrandLoaderSize; bg: BrandLoaderBg; initialLogoUrl?: string | null }) {
  const className = `portal-brand-loader-${size}`;
  if (size === 'xs') return <Spinner size={size} bg={bg} initialLogoUrl={initialLogoUrl} />;

  return (
    <>
      <style>{`
        .${className} { display: inline-block; line-height: 0; }
        @keyframes portalBrandSpin { to { transform: rotate(360deg); } }
        @media (max-width: 360px) { .${className} { transform: scale(0.55); } }
        @media (min-width: 361px) and (max-width: 480px) { .${className} { transform: scale(0.65); } }
        @media (min-width: 481px) and (max-width: 768px) { .${className} { transform: scale(0.82); } }
      `}</style>
      <div className={className}><Spinner size={size} bg={bg} initialLogoUrl={initialLogoUrl} /></div>
    </>
  );
}

export default function BrandLoader({ size = 'md', variant = 'inline', bg = 'light', text, initialLogoUrl, className = '' }: BrandLoaderProps) {
  const { textSize } = SIZE_MAP[size];
  const spinner = <ResponsiveSpinner size={size} bg={bg} initialLogoUrl={initialLogoUrl} />;
  const label = text ? <p style={{ color: bg === 'dark' ? '#fff' : '#374151', fontSize: textSize, fontWeight: 600, textAlign: 'center', lineHeight: 1.35 }}>{text}</p> : null;

  if (variant === 'inline') return <span className={`inline-flex flex-col items-center gap-2 ${className}`} role="status" aria-label="Loading">{spinner}{label}</span>;
  if (variant === 'section') return <div className={`flex w-full flex-col items-center justify-center gap-3 py-10 ${className}`} role="status" aria-label="Loading">{spinner}{label}</div>;
  if (variant === 'overlay') {
    return <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 ${className}`} role="status" aria-live="polite" style={{ backdropFilter: 'blur(5px)', background: bg === 'dark' ? 'rgba(10,10,10,0.7)' : 'rgba(255,255,255,0.75)', borderRadius: 'inherit' }}>{spinner}{label}</div>;
  }

  return <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 ${className}`} role="status" aria-live="polite" aria-label="Loading page" style={{ backdropFilter: 'blur(8px)', background: bg === 'dark' ? 'rgba(10,10,10,0.84)' : 'rgba(255,255,255,0.86)' }}>{spinner}{label}</div>;
}
