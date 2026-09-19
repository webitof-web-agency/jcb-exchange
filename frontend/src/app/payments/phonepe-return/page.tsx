import { Suspense } from 'react';
import PhonePeReturnClient from './PhonePeReturnClient';

export default function PhonePeReturnPage() {
  return (
    <Suspense fallback={null}>
      <PhonePeReturnClient />
    </Suspense>
  );
}
