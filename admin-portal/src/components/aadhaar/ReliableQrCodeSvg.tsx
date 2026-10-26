'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function ReliableQrCodeSvg({ value, size = 64, className = '' }: { value: string; size?: number | string; className?: string }) {
  const [markup, setMarkup] = useState('');

  useEffect(() => {
    let active = true;
    void QRCode.toString(value || 'Aadhaar DigiLocker data unavailable', {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F172A', light: '#FFFFFF' },
    }).then((svg) => {
      if (active) setMarkup(svg);
    }).catch(() => {
      if (active) setMarkup('');
    });
    return () => { active = false; };
  }, [value]);

  return (
    <span
      className={`inline-flex overflow-hidden bg-white ${className}`}
      style={{ width: size, height: size }}
      aria-label="Aadhaar provider XML QR code"
      dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
    />
  );
}
