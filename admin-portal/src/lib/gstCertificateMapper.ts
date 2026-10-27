import type { GstCertificateData } from '@/components/gstVerification/GstCertificatePdfDocument';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const safeString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  return str.length > 0 ? str : fallback;
};

const formatDate = (value: unknown): string => {
  if (!value) return '';
  const str = String(value).trim();
  // If already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  // If YYYY-MM-DD
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  // Try Date parse
  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return str;
};

export const parseGstAddress = (
  rawAddress: unknown,
  addressDetailsObj?: unknown,
  providerPradr?: unknown
): GstCertificateData['address'] => {
  const details = isRecord(addressDetailsObj) ? addressDetailsObj : {};
  const pradr = isRecord(providerPradr) && isRecord(providerPradr.addr) ? (providerPradr.addr as Record<string, unknown>) : {};

  // Check structured details first
  let floorNo = safeString(details.floor || pradr.flno);
  let buildingNo = safeString(details.building || details.door_num || pradr.bno);
  let premises = safeString(details.building_name || details.landmark || pradr.bnm);
  let road = safeString(details.street || pradr.st);
  let locality = safeString(details.locality || details.location || pradr.loc);
  let city = safeString(details.city || pradr.city);
  let district = safeString(details.district || pradr.dst);
  let state = safeString(details.state || pradr.stcd);
  let pinCode = safeString(details.pin_code || details.pincode || pradr.pncd);

  const fullText = safeString(rawAddress);

  // If structured parts are missing but fullText exists, parse intelligently
  if (fullText && (!district || !pinCode || !buildingNo)) {
    const parts = fullText.split(',').map((p) => p.trim()).filter(Boolean);

    // Pin code search
    const pinMatch = fullText.match(/\b(\d{6})\b/);
    if (!pinCode && pinMatch) pinCode = pinMatch[1];

    if (parts.length >= 2) {
      if (!state && parts.length >= 2) {
        const candidate = parts[parts.length - (pinMatch ? 2 : 1)];
        if (candidate) state = candidate;
      }
      if (!district && parts.length >= 3) {
        district = parts[parts.length - (pinMatch ? 3 : 2)];
      }
      if (!city && parts.length >= 4) {
        city = parts[parts.length - (pinMatch ? 4 : 3)];
      }
      if (!locality && parts.length >= 5) {
        locality = parts[parts.length - (pinMatch ? 5 : 4)];
      }
      if (!road && parts.length >= 6) {
        road = parts[parts.length - (pinMatch ? 6 : 5)];
      }
      if (!premises && parts.length >= 7) {
        premises = parts[parts.length - (pinMatch ? 7 : 6)];
      }
      if (!buildingNo && parts.length >= 8) {
        buildingNo = parts[parts.length - (pinMatch ? 8 : 7)];
      }
      if (!floorNo && parts.length >= 9) {
        floorNo = parts[0];
      }
    }
  }

  return {
    floorNo: floorNo || '',
    buildingNo: buildingNo || '',
    premises: premises || '',
    road: road || '',
    locality: locality || '',
    city: city || '',
    district: district || city || '',
    state: state || '',
    pinCode: pinCode || '',
    fullText,
  };
};

export const mapGstVerificationToCertificate = (
  previewOrResult: Record<string, unknown>,
  fallbackGstin = ''
): GstCertificateData => {
  // Support preview object (with .response, .number), raw backend service object (with .result, .record), or direct Surepass response (with .data)
  const hasResponse = isRecord(previewOrResult.response);
  const response = hasResponse ? (previewOrResult.response as Record<string, unknown>) : previewOrResult;
  const rawData = isRecord(response.data)
    ? (response.data as Record<string, unknown>)
    : (isRecord(previewOrResult.data) ? (previewOrResult.data as Record<string, unknown>) : {});
  const result = isRecord(response.result)
    ? (response.result as Record<string, unknown>)
    : (Object.keys(rawData).length > 0 ? rawData : response);
  const record = isRecord(response.record) ? (response.record as Record<string, unknown>) : {};
  const providerData = isRecord(result.providerData)
    ? (result.providerData as Record<string, unknown>)
    : (isRecord(response.providerData) ? (response.providerData as Record<string, unknown>) : rawData);
  const contactDetails = isRecord(result.contactDetails)
    ? (result.contactDetails as Record<string, unknown>)
    : (isRecord(rawData.contact_details)
      ? (rawData.contact_details as Record<string, unknown>)
      : (isRecord(providerData.contact_details)
        ? (providerData.contact_details as Record<string, unknown>)
        : (isRecord(providerData.contactDetails) ? (providerData.contactDetails as Record<string, unknown>) : {})));
  const principalContact = isRecord(contactDetails.principal)
    ? (contactDetails.principal as Record<string, unknown>)
    : {};

  const gstin = safeString(
    previewOrResult.number ||
      result.gstin ||
      result.gstin_number ||
      result.id_number ||
      rawData.gstin ||
      rawData.gstin_number ||
      rawData.id_number ||
      record.maskedGstin ||
      fallbackGstin,
    ''
  );

  const legalName = safeString(
    result.legalName ||
      result.legal_name ||
      rawData.legal_name ||
      rawData.legalName ||
      providerData.legal_name ||
      providerData.legalName ||
      record.legalName,
    ''
  );

  const tradeName = safeString(
    result.businessName ||
      result.business_name ||
      rawData.business_name ||
      result.tradeName ||
      result.trade_name ||
      rawData.trade_name ||
      providerData.trade_name ||
      record.businessName,
    ''
  );

  const additionalTradeNames = safeString(
    result.additionalTradeNames ||
      result.additional_trade_names ||
      rawData.additional_trade_names ||
      providerData.additional_trade_names,
    ''
  );

  const constitutionOfBusiness = safeString(
    result.constitutionOfBusiness ||
      result.constitution_of_business ||
      rawData.constitution_of_business ||
      providerData.constitution_of_business,
    ''
  );

  const regDateRaw =
    result.dateOfRegistration ||
    result.date_of_registration ||
    rawData.date_of_registration ||
    providerData.date_of_registration;
  const validityFrom = formatDate(regDateRaw) || '';
  const approvalDate = formatDate(
    result.approvalDate || result.approval_date || rawData.approval_date || providerData.approval_date,
  ) || validityFrom;
  const issueDate = formatDate(
    result.issueDate || result.issue_date || rawData.issue_date || providerData.issue_date,
  ) || validityFrom;

  const typeOfRegistration = safeString(
    result.taxpayerType ||
      result.taxpayer_type ||
      rawData.taxpayer_type ||
      providerData.taxpayer_type,
    ''
  );

  const cancellationDateRaw =
    result.dateOfCancellation ||
    result.date_of_cancellation ||
    rawData.date_of_cancellation ||
    providerData.date_of_cancellation;
  const validityTo = typeof cancellationDateRaw === 'string' && /^18\d{2}-/.test(cancellationDateRaw)
    ? ''
    : formatDate(cancellationDateRaw);

  const signature = isRecord(result.signature)
    ? (result.signature as Record<string, unknown>)
    : (isRecord(providerData.signature) ? (providerData.signature as Record<string, unknown>) : {});
  const signatureStatus = safeString(
    result.signatureStatus || result.signature_status || providerData.signature_status || signature.status,
    '',
  );
  const signatureIssuer = safeString(
    result.signatureIssuer || result.signature_issuer || providerData.signature_issuer || signature.issuer,
    '',
  );
  const signatureDate = safeString(
    result.signatureDate || result.signature_date || providerData.signature_date || signature.date,
    '',
  );
  const approverName = safeString(
    result.approverName || result.approver_name || providerData.approver_name,
    '',
  );
  const approverDesignation = safeString(
    result.approverDesignation || result.approver_designation || providerData.approver_designation,
    '',
  );

  const jurisdiction = safeString(
    result.centerJurisdiction ||
      result.center_jurisdiction ||
      rawData.center_jurisdiction ||
      result.stateJurisdiction ||
      result.state_jurisdiction ||
      rawData.state_jurisdiction ||
      providerData.center_jurisdiction ||
      providerData.state_jurisdiction,
    ''
  );

  const address = parseGstAddress(
    result.address || rawData.address || providerData.address || principalContact.address,
    result.addressDetails || rawData.address_details || providerData.address_details,
    providerData.pradr
  );

  // Extract promoters / signatories dynamically from the provider response.
  // Some provider versions return an empty normalized `promoters` array while
  // keeping the populated list under providerData or a director/signatory key.
  const promoterCandidates = [
    result.promoters,
    rawData.promoters,
    providerData.promoters,
    providerData.directors,
    providerData.director_details,
    providerData.signatories,
    providerData.authorized_signatories,
    providerData.person_in_charge,
  ];
  const rawPromoters = promoterCandidates.find((value) => Array.isArray(value) && value.length > 0);
  let promoters: GstCertificateData['promoters'] = [];

  if (Array.isArray(rawPromoters)) {
    promoters = rawPromoters.map((item) => {
      if (typeof item === 'string') {
        return {
          name: item.trim(),
          designation: '',
          state: '',
        };
      }
      if (isRecord(item)) {
        return {
          name: safeString(item.name || item.promoter_name || item.director_name || item.full_name, ''),
          designation: safeString(item.designation || item.status || item.designation_status, ''),
          state: safeString(item.state || item.resident_of_state || item.residentState, ''),
          photoUrl: typeof item.photoUrl === 'string' ? item.photoUrl : typeof item.photo_url === 'string' ? item.photo_url : undefined,
        };
      }
      return {
        name: '',
        designation: '',
        state: address.state || '',
      };
    }).filter((p) => p.name.length > 0);
  }

  // Extract additional places dynamically
  let additionalPlaces: Array<{ address: string }> = [];
  const rawAdditional = result.additionalPlaces || providerData.additional_places || providerData.adadr;
  if (Array.isArray(rawAdditional)) {
    additionalPlaces = rawAdditional.map((place) => {
      if (typeof place === 'string') return { address: place };
      if (isRecord(place)) {
        const addrStr = safeString(place.address || place.addr);
        return { address: addrStr };
      }
      return { address: '' };
    }).filter((p) => p.address.length > 0);
  }

  const additionalPlacesCount = typeof result.additionalPlacesCount === 'number'
    ? result.additionalPlacesCount
    : additionalPlaces.length;

  return {
    gstin,
    legalName,
    tradeName,
    additionalTradeNames,
    constitutionOfBusiness,
    address,
    dateOfLiability: formatDate(
      result.dateOfLiability ||
        result.date_of_liability ||
        rawData.date_of_liability ||
        providerData.date_of_liability ||
        regDateRaw,
    ),
    validityFrom,
    validityTo,
    typeOfRegistration,
    approvalDate,
    issueDate,
    jurisdiction,
    signatureStatus,
    signatureIssuer,
    signatureDate,
    approverName,
    approverDesignation,
    additionalPlacesCount,
    additionalPlaces,
    promoters,
  };
};
