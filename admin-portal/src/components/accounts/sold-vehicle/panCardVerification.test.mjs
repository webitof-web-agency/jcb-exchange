import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPanCardData } from './panCardVerification.mjs';
import { buildPanCardExportSvg } from './panCardExport.mjs';
import { buildAadhaarCardData, buildSharedAadhaarTemplateData, getAadhaarVerificationRecordId, hasAadhaarCardData } from './aadhaarVerification.mjs';
import { DEFAULT_PAN_SIGNATURE_URL, resolvePanCardSignatureUrl } from '../../pancard/panCardDisplay.mjs';

test('maps the verified PAN response into the real PAN card template fields', () => {
  const preview = {
    number: 'ASXPH5090E',
    response: {
      record: { verifiedAt: '2026-10-22T08:30:00.000Z' },
      result: {
        pan: 'ASXPH5090E',
        name: 'HITESH',
        father_name: '-',
        dob: '1998-08-20',
        masked_aadhaar: 'XXXXXXXX5043',
      },
    },
  };

  assert.deepEqual(buildPanCardData(preview, preview.response.result), {
    panNumber: 'ASXPH5090E',
    name: 'HITESH',
    fatherName: '-',
    dob: '1998-08-20',
    dateOfIssue: '2026-10-22T08:30:00.000Z',
    signatureText: 'HITESH',
    qrData: 'PAN:ASXPH5090E|NAME:HITESH|FATHER:-|DOB:1998-08-20',
    maskedAadhaar: 'XXXXXXXX5043',
  });
});

test('builds a self-contained XHTML export wrapper for the rendered card', () => {
  const svg = buildPanCardExportSvg({
    width: 490,
    height: 309,
    markup: '<div style="color:red">PAN</div>',
  });

  assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<foreignObject[^>]+width="490"[^>]+height="309"/);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(svg, /<div style="color:red">PAN<\/div>/);
  assert.doesNotMatch(svg, /<style>/);
});

test('keeps the template signature visible when the provider has no signature image', () => {
  assert.equal(resolvePanCardSignatureUrl(null), DEFAULT_PAN_SIGNATURE_URL);
  assert.equal(resolvePanCardSignatureUrl({}), undefined);
  assert.equal(resolvePanCardSignatureUrl({ signatureUrl: '/uploads/hitesh-signature.png' }), '/uploads/hitesh-signature.png');
});

test('maps only fetched Aadhaar fields and never injects template demo data', () => {
  const preview = {
    number: 'XXXXXXXX5043',
    response: {},
  };
  const result = {
    panDetails: {
      maskedAadhaar: 'XXXXXXXX5043',
      fullName: 'HITESH',
      dob: '1998-08-20',
      gender: 'Male',
      address: { full: 'Jaipur, Rajasthan, 302001' },
    },
  };

  const data = buildAadhaarCardData(preview, result);
  assert.equal(data.aadhaarNumber, 'XXXXXXXX5043');
  assert.equal(data.nameEnglish, 'HITESH');
  assert.equal(data.dob, '1998-08-20');
  assert.equal(data.gender, 'Male');
  assert.equal(data.addressEnglish, 'Jaipur, Rajasthan, 302001');
  assert.equal(hasAadhaarCardData(data), true);
  assert.equal(hasAadhaarCardData(buildAadhaarCardData({ number: '', response: {} }, {})), false);
});

test('uses the verified 12-digit number entered in the current preview over the masked provider value', () => {
  const data = buildAadhaarCardData(
    { number: '943189456659', response: {} },
    { maskedAadhaar: 'XXXXXXXX5659', fullName: 'MEGHRAJ DEWANGAN' },
  );

  assert.equal(data.aadhaarNumber, '943189456659');
});

test('maps sold-vehicle Aadhaar data into the shared Identity Hub template contract', () => {
  const data = buildSharedAadhaarTemplateData(
    { number: 'XXXXXXXX5043', response: {} },
    {
      fullName: 'HITESH KUMAR',
      fatherName: 'RAJ KUMAR',
      maskedAadhaar: 'XXXXXXXX5043',
      dob: '1998-08-20',
      gender: 'M',
      mobileNumber: '9876543210',
      profileImage: 'data:image/jpeg;base64,abc',
      address: {
        house: '12',
        street: 'Main Road',
        locality: 'Civil Lines',
        vtc: 'Jaipur',
        district: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
      },
    },
  );

  assert.equal(data.fullName, 'HITESH KUMAR');
  assert.equal(data.fatherName, 'RAJ KUMAR');
  assert.equal(data.maskedAadhaar, 'XXXXXXXX5043');
  assert.equal(data.mobileNumber, '9876543210');
  assert.deepEqual(data.address, {
    house: '12',
    street: 'Main Road',
    locality: 'Civil Lines',
    vtc: 'Jaipur',
    district: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
  });
});

test('extracts only the persisted Aadhaar verification record id for template upload', () => {
  assert.equal(getAadhaarVerificationRecordId({ response: { record: { id: 'aadhaar-record-1', maskedAadhaar: 'XXXXXXXX1231' } } }), 'aadhaar-record-1');
  assert.equal(getAadhaarVerificationRecordId({ response: { record: { id: 'aadhaar-record-1', maskedPan: 'ABCDE1234F' } } }), '');
  assert.equal(getAadhaarVerificationRecordId({ response: { record: { id: 42, maskedAadhaar: 'XXXXXXXX1231' } } }), '');
  assert.equal(getAadhaarVerificationRecordId({ response: { result: { id: 'provider-result' } } }), '');
});
