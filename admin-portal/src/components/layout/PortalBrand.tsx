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
    ? 'w-full max-w-[240px] sm:max-w-[360px]'
    : 'w-full max-w-[200px] sm:max-w-[240px] md:max-w-[300px]';
  const maxHeightClass = size === 'footer' ? 'max-h-[80px]' : 'max-h-[64px]';
  const fallbackClass = size === 'footer'
    ? 'text-xl font-bold italic tracking-wider text-[#FFC107]'
    : 'text-xl font-bold italic tracking-wider text-[#FFC107]';

  return (
    <div>
      <Link href={href} className={`inline-flex items-center ${wrapperClass}`}>
        {logoUrl ? (
          <div className={`relative flex items-center ${wrapperClass}`}>
            <Image
              src={logoUrl}
              alt="JCB Exchange"
              width={300}
              height={80}
              unoptimized
              priority={size === 'header'}
              loading={size === 'header' ? 'eager' : 'lazy'}
              className={`w-full h-auto object-contain object-left ${maxHeightClass}`}
            />
          </div>
        ) : null}
      </Link>
      {subtitle ? (
        <p className="mt-1 text-xs uppercase tracking-widest text-gray-400">{subtitle}</p>
      ) : null}
    </div>
  );
}
