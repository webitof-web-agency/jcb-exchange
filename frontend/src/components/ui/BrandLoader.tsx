'use client';

import React from 'react';

export type BrandLoaderSize    = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type BrandLoaderVariant = 'inline' | 'section' | 'overlay' | 'fullscreen';
export type BrandLoaderBg      = 'dark' | 'light';

export interface BrandLoaderProps {
  size?      : BrandLoaderSize;
  variant?   : BrandLoaderVariant;
  bg?        : BrandLoaderBg;
  text?      : string;
  initialLogoUrl?: string | null;
  className? : string;
}

const SIZE_MAP: Record<BrandLoaderSize, { ring: number; logo: number; strokeW: number; textCls: string }> = {
  xs: { ring: 40,  logo: 0,  strokeW: 3.5, textCls: 'text-[10px]' },
  sm: { ring: 64,  logo: 28, strokeW: 4,   textCls: 'text-xs'     },
  md: { ring: 96,  logo: 42, strokeW: 5,   textCls: 'text-sm'     },
  lg: { ring: 132, logo: 58, strokeW: 6,   textCls: 'text-sm'     },
  xl: { ring: 172, logo: 76, strokeW: 7,   textCls: 'text-base'   },
};

const JCB_YELLOW = '#FFC107';

function ArcRing({ size, bg }: { size: BrandLoaderSize; bg: BrandLoaderBg }) {
  const { ring, strokeW } = SIZE_MAP[size];
  const r         = (ring - strokeW * 2) / 2;
  const cx        = ring / 2;
  const cy        = ring / 2;
  const circ      = 2 * Math.PI * r;
  const arcLength = circ * 0.75;
  const gapLength = circ * 0.25;
  const trackStroke = bg === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';

  return (
    <svg
      width={ring}
      height={ring}
      viewBox={`0 0 ${ring} ${ring}`}
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, transform: 'rotate(-90deg)' }}
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackStroke} strokeWidth={strokeW} strokeLinecap="round" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={JCB_YELLOW}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${arcLength} ${gapLength}`}
        style={{ animation: 'brandSpin 1s linear infinite', transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    </svg>
  );
}

function LoaderLogo({ ring }: { ring: number }) {
  const activeLogoUrl = '/loadinglogo.png';

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {activeLogoUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={activeLogoUrl}
          alt="JCB Exchange"
          fetchPriority="high"
          decoding="async"
          style={{
            position: 'absolute',
            width: 'auto',
            height: 'auto',
            maxWidth: ring * 0.76,
            maxHeight: ring * 0.46,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      )}
    </div>
  );
}

function Spinner({ size, bg }: { size: BrandLoaderSize; bg: BrandLoaderBg }) {
  const { ring } = SIZE_MAP[size];

  return (
    <div style={{ position: 'relative', width: ring, height: ring, flexShrink: 0 }} role="status" aria-label="Loading">
      <ArcRing size={size} bg={bg} />
      {size !== 'xs' && (
        <LoaderLogo
          key="static-loading-logo"
          ring={ring}
        />
      )}
    </div>
  );
}

function ResponsiveSpinner({ size, bg }: { size: BrandLoaderSize; bg: BrandLoaderBg }) {
  const cls = `bl-r-${size}`;
  if (size === 'xs') return <Spinner size={size} bg={bg} />;
  return (
    <>
      <style>{`
        .${cls} { transform-origin: center center; display: inline-block; line-height: 0; }
        @media (max-width: 360px)                         { .${cls} { transform: scale(0.55); } }
        @media (min-width: 361px) and (max-width: 480px)  { .${cls} { transform: scale(0.65); } }
        @media (min-width: 481px) and (max-width: 768px)  { .${cls} { transform: scale(0.82); } }
        @media (min-width: 769px)                         { .${cls} { transform: scale(1); } }
      `}</style>
      <div className={cls}><Spinner size={size} bg={bg} /></div>
    </>
  );
}

function LoaderText({ text, textCls, bg }: { text: string; textCls: string; bg: BrandLoaderBg }) {
  return (
    <p className={`brand-loader-text ${textCls} font-semibold text-center leading-snug`} style={{ color: bg === 'dark' ? '#ffffff' : '#374151' }}>
      {text}
    </p>
  );
}

export default function BrandLoader({ size = 'md', variant = 'inline', bg = 'light', text, className = '' }: BrandLoaderProps) {
  const { textCls } = SIZE_MAP[size];
  const spinner = <ResponsiveSpinner size={size} bg={bg} />;

  if (variant === 'inline') {
    return (
      <span className={`inline-flex flex-col items-center gap-2 ${className}`} role="status" aria-label="Loading">
        {spinner}
        {text && <LoaderText text={text} textCls={textCls} bg={bg} />}
      </span>
    );
  }

  if (variant === 'section') {
    return (
      <div className={`flex w-full flex-col items-center justify-center gap-3 py-10 ${className}`} role="status" aria-label="Loading">
        {spinner}
        {text && <LoaderText text={text} textCls={textCls} bg={bg} />}
      </div>
    );
  }

  if (variant === 'overlay') {
    return (
      <div
        className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 ${className}`}
        role="status" aria-live="polite"
        style={{ backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', background: bg === 'dark' ? 'rgba(10,10,10,0.70)' : 'rgba(255,255,255,0.75)', borderRadius: 'inherit' }}
      >
        {spinner}
        {text && <LoaderText text={text} textCls={textCls} bg={bg} />}
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 ${className}`}
      role="status" aria-live="polite" aria-label="Loading page"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', background: bg === 'dark' ? 'rgba(10,10,10,0.84)' : 'rgba(255,255,255,0.86)' }}
    >
      {spinner}
      {text && <LoaderText text={text} textCls={textCls} bg={bg} />}
    </div>
  );
}
