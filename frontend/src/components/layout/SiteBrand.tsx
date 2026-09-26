'use client';

import Image from 'next/image';
import Link from 'next/link';

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
  const widthClass = variant === 'footer'
    ? 'w-full max-w-[240px] md:max-w-[360px]'
    : 'w-full max-w-[200px] sm:max-w-[240px] md:max-w-[300px]';

  return (
    <Link href={href} className={`inline-flex items-center ${widthClass}`}>
      <div className={`relative flex items-center ${widthClass}`}>
        <Image
          src={variant === 'footer' ? '/frontfooterlogo.png' : '/frontheadlogo.png'}
          alt="JCB Exchange"
          width={300}
          height={80}
          sizes={variant === 'footer' ? '(max-width: 768px) 240px, 360px' : '(max-width: 640px) 200px, (max-width: 768px) 240px, 300px'}
          priority={variant === 'navbar'}
          loading={variant === 'navbar' ? 'eager' : 'lazy'}
          style={{ width: '100%', height: 'auto' }}
          className={`object-contain ${align === 'center' ? 'object-center mx-auto' : 'object-left'} ${variant === 'footer' ? 'max-h-[80px]' : 'max-h-[64px]'}`}
        />
      </div>
    </Link>
  );
}
