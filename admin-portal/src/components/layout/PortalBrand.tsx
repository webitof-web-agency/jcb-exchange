'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';

type PortalBrandProps = {
  href: string;
  size?: 'header' | 'footer';
  subtitle?: string | null;
};

export default function PortalBrand({
  href,
  size = 'header',
  subtitle,
}: PortalBrandProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadLogo = async () => {
      try {
        const response = await api.get<{ data?: { imageUrl?: string | null } }>('/master/site-logo');
        if (!isMounted) {
          return;
        }

        setLogoUrl(getAbsoluteFileUrl(response.data?.data?.imageUrl || null) || null);
      } catch {
        if (isMounted) {
          setLogoUrl(null);
        }
      }
    };

    void loadLogo();

    return () => {
      isMounted = false;
    };
  }, []);

  const wrapperClass = size === 'footer'
    ? 'w-full max-w-[240px] sm:max-w-[360px] mx-auto'
    : 'w-full max-w-[180px] sm:max-w-[220px] mx-auto';
  const maxHeightClass = size === 'footer' ? 'max-h-[80px]' : 'max-h-[64px]';

  return (
    <div className="flex flex-col items-center justify-center text-center w-full">
      <Link href={href} className={`flex items-center justify-center ${wrapperClass}`}>
        {logoUrl ? (
          <div className={`relative flex items-center justify-center ${wrapperClass}`}>
            <Image
              src={logoUrl}
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
      {subtitle ? (
        <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-gray-400 text-center">{subtitle}</p>
      ) : null}
    </div>
  );
}
