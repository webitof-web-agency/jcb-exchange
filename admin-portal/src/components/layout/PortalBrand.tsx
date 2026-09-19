'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSiteLogo } from '@/hooks/useSiteLogo';

type PortalBrandProps = {
  href: string;
  size?: 'header' | 'footer';
  subtitle?: string | null;
  className?: string;
  showSubtitle?: boolean;
};

export default function PortalBrand({
  href,
  size = 'header',
  subtitle,
  className = '',
  showSubtitle = true,
}: PortalBrandProps) {
  const { logoUrl, darkLogoUrl } = useSiteLogo();
  const activeLogoUrl = logoUrl || darkLogoUrl;

  const wrapperClass = size === 'footer'
    ? 'max-w-[240px] sm:max-w-[360px]'
    : 'max-w-[160px] sm:max-w-[190px]';
  const maxHeightClass = size === 'footer' ? 'max-h-[80px]' : 'max-h-[56px]';

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <Link href={href} className={`inline-flex items-center justify-center ${wrapperClass}`}>
        {activeLogoUrl ? (
          <div className={`relative flex items-center justify-center ${wrapperClass}`}>
            <Image
              src={activeLogoUrl}
              alt="JCB Exchange"
              width={300}
              height={80}
              unoptimized
              priority={size === 'header'}
              loading={size === 'header' ? 'eager' : 'lazy'}
              className={`w-full h-auto object-contain object-center mx-auto ${maxHeightClass}`}
            />
          </div>
        ) : null}
      </Link>
      {showSubtitle && subtitle ? (
        <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-gray-400 text-center">{subtitle}</p>
      ) : null}
    </div>
  );
}
