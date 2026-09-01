'use client';

import React from 'react';

type CategoryIconRendererProps = {
  svgData?: string | null;
  name?: string;
  className?: string;
  fallbackClassName?: string;
};

/**
 * Normalizes SVG viewBox and artwork padding ratio so all category icons—
 * regardless of whether their source viewBox is 24x24, 32x32, 48x48, or 96x96—
 * render with 100% identical physical visual size, scale, and line stroke width.
 */
export function normalizeCategorySvg(svgData?: string | null): string {
  if (!svgData || typeof svgData !== 'string') {
    return '';
  }

  let normalized = svgData.trim();

  // Normalize 24x24 viewBox (e.g. Lucide/Tabler default icons) to match 96x96 50% ratio
  if (/viewBox=["']\s*0\s+0\s+24\s+24\s*["']/i.test(normalized)) {
    normalized = normalized.replace(/viewBox=["']\s*0\s+0\s+24\s+24\s*["']/i, 'viewBox="-8 -8 40 40"');
  } 
  // Normalize 32x32 viewBox
  else if (/viewBox=["']\s*0\s+0\s+32\s+32\s*["']/i.test(normalized)) {
    normalized = normalized.replace(/viewBox=["']\s*0\s+0\s+32\s+32\s*["']/i, 'viewBox="-8 -8 48 48"');
  } 
  // Normalize 48x48 viewBox
  else if (/viewBox=["']\s*0\s+0\s+48\s+48\s*["']/i.test(normalized)) {
    normalized = normalized.replace(/viewBox=["']\s*0\s+0\s+48\s+48\s*["']/i, 'viewBox="-12 -12 72 72"');
  } 
  // If no viewBox is specified, supply a default padded viewBox
  else if (!/viewBox=/i.test(normalized)) {
    normalized = normalized.replace(/<svg/i, '<svg viewBox="-8 -8 40 40"');
  }

  return normalized;
}

export default function CategoryIconRenderer({
  svgData,
  name,
  className = 'h-12 w-12 sm:h-16 sm:w-16 text-gray-700 group-hover:text-black transition-colors',
  fallbackClassName = 'h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold group-hover:bg-[#fca311]/20 group-hover:text-[#fca311] transition-colors',
}: CategoryIconRendererProps) {
  const normalizedSvg = normalizeCategorySvg(svgData);

  if (!normalizedSvg) {
    return (
      <div className={fallbackClassName}>
        {name ? name.substring(0, 2).toUpperCase() : 'CAT'}
      </div>
    );
  }

  return (
    <div
      className={`${className} [&_svg]:h-full [&_svg]:w-full [&_svg]:stroke-current [&_svg]:text-current [&_svg]:fill-none [&_svg_*]:[vector-effect:non-scaling-stroke] [&_svg_*]:[stroke-width:1.25px] [&_svg_*]:fill-none`}
      dangerouslySetInnerHTML={{ __html: normalizedSvg }}
      aria-hidden="true"
    />
  );
}
