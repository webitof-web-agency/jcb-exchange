'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

type SafeRemoteVideoProps = {
  src?: string | null;
  fallbackSrcs?: string[];
  className?: string;
  controls?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  fallback?: ReactNode;
  onError?: () => void;
};

export default function SafeRemoteVideo({
  src,
  fallbackSrcs = [],
  className,
  controls,
  muted,
  autoPlay,
  playsInline,
  preload,
  fallback = null,
  onError,
}: SafeRemoteVideoProps) {
  const sourceCandidates = useMemo(
    () => Array.from(new Set([src, ...fallbackSrcs].filter((candidate): candidate is string => Boolean(candidate)))),
    [src, fallbackSrcs]
  );
  const sourceKey = src || '';
  const [failureState, setFailureState] = useState({ sourceKey: '', index: 0 });
  const sourceIndex = failureState.sourceKey === sourceKey ? failureState.index : 0;

  const currentSrc = sourceCandidates[sourceIndex] || '';
  if (!currentSrc) {
    return <>{fallback}</>;
  }

  return (
    <video
      key={currentSrc}
      src={currentSrc}
      controls={controls}
      muted={muted}
      autoPlay={autoPlay}
      playsInline={playsInline}
      preload={preload}
      className={className}
      onError={() => {
        if (sourceIndex < sourceCandidates.length - 1) {
          setFailureState({ sourceKey, index: sourceIndex + 1 });
          return;
        }

        onError?.();
        setFailureState({ sourceKey, index: sourceCandidates.length });
      }}
    />
  );
}
