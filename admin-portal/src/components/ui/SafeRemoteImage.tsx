'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

type SafeRemoteImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
  onError?: () => void;
};

export default function SafeRemoteImage({
  src,
  alt,
  className,
  fallback,
  onError,
}: SafeRemoteImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasError = !src || failedSrc === src;

  if (hasError) {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        setFailedSrc(src);
        onError?.();
      }}
    />
  );
}
