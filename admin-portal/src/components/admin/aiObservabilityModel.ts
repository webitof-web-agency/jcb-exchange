export type AiToolDataAvailability = 'AVAILABLE' | 'UNAVAILABLE' | null;

export const formatLatency = (durationMs: number) => {
  const safeDuration = Math.max(0, Math.round(durationMs));
  if (safeDuration < 1000) return `${safeDuration} ms`;
  return `${(safeDuration / 1000).toFixed(1)} s`;
};

export const availabilityLabel = (availability: AiToolDataAvailability) => {
  if (availability === 'AVAILABLE') return 'Data available';
  if (availability === 'UNAVAILABLE') return 'Data unavailable';
  return 'Not reported';
};
