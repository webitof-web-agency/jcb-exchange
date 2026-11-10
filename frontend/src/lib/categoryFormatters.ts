/**
 * Formats raw government/RTO category names into clean, professional marketplace labels.
 * If the category is a standard human-created category, it preserves the original name.
 */
export function formatCategoryDisplayName(rawName?: string | null): string {
  if (!rawName || typeof rawName !== 'string') {
    return '';
  }

  const trimmed = rawName.trim();
  const upper = trimmed.toUpperCase();

  // Known Vahan / RTO government raw strings
  if (upper === 'OTHER THAN MENTIONED ABOVE' || upper.startsWith('OTHER THAN MENTIONED')) {
    return 'Other Heavy Equipment';
  }

  if (
    upper === 'M-CYCLE/SCOOTER(2WN)' ||
    upper === 'M-CYCLE/SCOOTER (2WN)' ||
    upper === 'M-CYCLE / SCOOTER(2WN)' ||
    upper === 'M-CYCLE' ||
    upper.includes('SCOOTER(2WN)')
  ) {
    return 'Motorcycle & Scooter';
  }

  if (upper === 'EXCAVATOR (NT)' || upper === 'EXCAVATOR(NT)') {
    return 'Excavator';
  }

  if (upper === 'MOTOR CAR(LMV)' || upper === 'MOTOR CAR (LMV)') {
    return 'Commercial Car (LMV)';
  }

  if (upper === 'MOTOR CAR') {
    return 'Commercial Vehicle';
  }

  // If a category ends with RTO classification like "(NT)" or "(2WN)", strip the technical suffix
  if (/\s*\((NT|2WN|LMV|MMV|HMV)\)\s*$/i.test(trimmed)) {
    return trimmed.replace(/\s*\((NT|2WN|LMV|MMV|HMV)\)\s*$/i, '').trim();
  }

  return trimmed;
}

/**
 * Returns an authentic industrial line-art SVG (matching viewBox 0 0 96 96 and stroke 1.44)
 * when a category was auto-imported from the API without an assigned iconId.
 */
export function getCategoryFallbackSvg(categoryName?: string | null): string {
  const normalized = String(categoryName || '').trim().toLowerCase();

  // 1. Excavator / Digger / Poclain
  if (normalized.includes('excavator') || normalized.includes('poclain') || normalized.includes('digger')) {
    return `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M19.2 62.4C19.2 64.5194 20.9208 66.2401 23.0402 66.2401C25.1595 66.2401 26.8802 64.5194 26.8802 62.4001C26.8802 60.2807 25.1595 58.5601 23.0402 58.5601C20.9208 58.5601 19.2 60.2807 19.2 62.4" stroke="#1F2937" stroke-width="1.44"/>
<path d="M48 57.6C48 62.8984 52.3016 67.2 57.6 67.2C62.8984 67.2 67.2 62.8984 67.2 57.6C67.2 52.3016 62.8984 48 57.6 48C52.3016 48 48 52.3016 48 57.6" stroke="#1F2937" stroke-width="1.44"/>
<path d="M23.04 62.4H57.6" stroke="#1F2937" stroke-width="1.44"/>
<path d="M28.8 52.8V43.2H48L52.8 57.6L28.8 52.8" stroke="#1F2937" stroke-width="1.44"/>
<path d="M48 43.2V33.6H62.4V48" stroke="#1F2937" stroke-width="1.44"/>
</svg>`;
  }

  // 2. Two-Wheeler (Motorcycle, Scooter, Bike, M-Cycle)
  if (
    normalized.includes('scooter') ||
    normalized.includes('m-cycle') ||
    normalized.includes('cycle') ||
    normalized.includes('bike') ||
    normalized.includes('2wn')
  ) {
    return `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="26" cy="62" r="10" stroke="#1F2937" stroke-width="1.44"/>
<circle cx="70" cy="62" r="10" stroke="#1F2937" stroke-width="1.44"/>
<path d="M26 62L40 46H52L58 56H70" stroke="#1F2937" stroke-width="1.44"/>
<path d="M40 46L46 62H58" stroke="#1F2937" stroke-width="1.44"/>
<path d="M52 46L62 34H68" stroke="#1F2937" stroke-width="1.44"/>
<path d="M34 46H44" stroke="#1F2937" stroke-width="1.44"/>
</svg>`;
  }

  // 3. Four-Wheeler / Commercial Car / LMV
  if (
    normalized.includes('car') ||
    normalized.includes('lmv') ||
    normalized.includes('sedan') ||
    normalized.includes('suv') ||
    normalized.includes('jeep')
  ) {
    return `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="28" cy="64" r="8" stroke="#1F2937" stroke-width="1.44"/>
<circle cx="68" cy="64" r="8" stroke="#1F2937" stroke-width="1.44"/>
<path d="M14 56L20 46H34L44 38H62L74 46H82V58H76" stroke="#1F2937" stroke-width="1.44"/>
<path d="M20 64H14V56H20" stroke="#1F2937" stroke-width="1.44"/>
<path d="M36 64H60" stroke="#1F2937" stroke-width="1.44"/>
<path d="M44 38V46H62" stroke="#1F2937" stroke-width="1.44"/>
</svg>`;
  }

  // 4. Backhoe / Loader
  if (normalized.includes('loader') || normalized.includes('backhoe')) {
    return `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M30.72 57.6H65.28C66.34 57.6 67.2 58.46 67.2 59.52V65.28C67.2 66.34 66.34 67.2 65.28 67.2H30.72C29.66 67.2 28.8 66.34 28.8 65.28V59.52C28.8 58.46 29.66 57.6 30.72 57.6" stroke="#1F2937" stroke-width="1.44"/>
<rect x="38.4" y="38.4" width="19.2" height="19.2" stroke="#1F2937" stroke-width="1.44"/>
<path d="M38.4 43.2L19.2 48L9.6 57.6L14.4 62.4" stroke="#1F2937" stroke-width="1.44"/>
</svg>`;
  }

  // 5. Truck / Tipper / Transport / Dumper
  if (normalized.includes('truck') || normalized.includes('tipper') || normalized.includes('dumper')) {
    return `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9.6 62.4C9.6 65.05 11.75 67.2 14.4 67.2C17.05 67.2 19.2 65.05 19.2 62.4C19.2 59.75 17.05 57.6 14.4 57.6C11.75 57.6 9.6 59.75 9.6 62.4" stroke="#1F2937" stroke-width="1.44"/>
<path d="M67.2 62.4C67.2 65.05 69.35 67.2 72 67.2C74.65 67.2 76.8 65.05 76.8 62.4C76.8 59.75 74.65 57.6 72 57.6C69.35 57.6 67.2 59.75 67.2 62.4" stroke="#1F2937" stroke-width="1.44"/>
<path d="M19.2 62.4H67.2" stroke="#1F2937" stroke-width="1.44"/>
<path d="M14.4 57.6V43.2H48V57.6" stroke="#1F2937" stroke-width="1.44"/>
<path d="M48 48H67.2L76.8 57.6V62.4" stroke="#1F2937" stroke-width="1.44"/>
</svg>`;
  }

  // 6. Crane / Hoist / Lift
  if (normalized.includes('crane') || normalized.includes('lift') || normalized.includes('hoist')) {
    return `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M38.4 62.4H57.6V67.2H38.4V62.4" stroke="#1F2937" stroke-width="1.44"/>
<rect x="43.2" y="48" width="9.6" height="14.4" stroke="#1F2937" stroke-width="1.44"/>
<path d="M48 48L62.4 24H76.8" stroke="#1F2937" stroke-width="1.44"/>
<path d="M72 24V40" stroke="#1F2937" stroke-width="1.44"/>
</svg>`;
  }

  // 7. Universal Fallback: Premium Heavy Machinery / Construction Equipment
  // (Used for "OTHER THAN MENTIONED ABOVE" or any unrecognized machinery)
  return `<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M24 64C24 67.31 26.69 70 30 70C33.31 70 36 67.31 36 64C36 60.69 33.31 58 30 58C26.69 58 24 60.69 24 64" stroke="#1F2937" stroke-width="1.44"/>
<path d="M60 64C60 67.31 62.69 70 66 70C69.31 70 72 67.31 72 64C72 60.69 69.31 58 66 58C62.69 58 60 60.69 60 64" stroke="#1F2937" stroke-width="1.44"/>
<path d="M36 64H60" stroke="#1F2937" stroke-width="1.44"/>
<path d="M28 58V44H52V58" stroke="#1F2937" stroke-width="1.44"/>
<path d="M52 44L68 52V64" stroke="#1F2937" stroke-width="1.44"/>
<path d="M42 34H48V44H42V34" stroke="#1F2937" stroke-width="1.44"/>
<path d="M20 64H16V54L28 48" stroke="#1F2937" stroke-width="1.44"/>
</svg>`;
}

