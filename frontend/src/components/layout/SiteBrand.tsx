'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';

type SiteBrandProps = {
  href?: string;
  variant?: 'navbar' | 'footer';
  align?: 'left' | 'center';
};

export default function SiteBrand({
  href = '/',
  variant = 'navbar',
  align = 'left',
}: SiteBrandProps) {
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

  const widthClass = variant === 'footer'
    ? 'w-full max-w-[240px] md:max-w-[360px]'
    : 'w-full max-w-[200px] sm:max-w-[240px] md:max-w-[300px]';

  return (
    <Link href={href} className={`inline-flex items-center ${widthClass}`}>
      {logoUrl ? (
        <div className={`relative flex items-center ${widthClass}`}>
          <Image
            src={logoUrl}
            alt="JCB Exchange"
            width={300}
            height={80}
            sizes={variant === 'footer' ? '(max-width: 768px) 240px, 360px' : '(max-width: 640px) 200px, (max-width: 768px) 240px, 300px'}
            unoptimized
            priority={variant === 'navbar'}
            loading={variant === 'navbar' ? 'eager' : 'lazy'}
            style={{ width: '100%', height: 'auto' }}
            className={`object-contain ${align === 'center' ? 'object-center mx-auto' : 'object-left'} ${variant === 'footer' ? 'max-h-[80px]' : 'max-h-[64px]'}`}
          />
        </div>
      ) : null}
    </Link>
  );
}
