import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aadhaarMatchesMasked,
  maskAadhaar,
  normalizeAadhaarDownloadResult,
  validateAadhaarNumber,
} from './aadhaarVerification.service';

test('validates an Aadhaar number with length and Verhoeff checksum', () => {
  assert.equal(validateAadhaarNumber('3114 8765 1231'), null);
  assert.equal(validateAadhaarNumber('3114 8765 1233'), 'Enter a valid 12-digit Aadhaar number.');
  assert.equal(validateAadhaarNumber('1234'), 'Enter a valid 12-digit Aadhaar number.');
});

test('masks Aadhaar numbers without exposing the first eight digits', () => {
  assert.equal(maskAadhaar('311487651231'), 'XXXXXXXX1231');
});

test('matches the entered Aadhaar with the returned masked Aadhaar', () => {
  assert.equal(aadhaarMatchesMasked('311487651231', 'XXXXXXXX1231'), true);
  assert.equal(aadhaarMatchesMasked('311487651231', 'XXXXXXXX1234'), false);
  assert.equal(aadhaarMatchesMasked('XXXXXXXX1231', '1231'), true);
});
test('normalizes the Surepass DigiLocker response from the documented nested shape', () => {
  const result = normalizeAadhaarDownloadResult({
    client_id: 'digilocker_12345ABCDE',
    digilocker_metadata: {
      name: 'RAHUL KUMAR',
      gender: 'M',
      dob: '1995-05-15',
      mobile_number: '9876543210',
    },
    aadhaar_xml_data: {
      full_name: 'Rahul Kumar',
      care_of: 'S/O: Mohan Kumar',
      dob: '1995-05-15',
      yob: '1995',
      zip: '110001',
      profile_image: 'base64_encoded_image_string',
      gender: 'M',
      masked_aadhaar: 'XXXXXXXX1234',
      full_address: 'Connaught Place, New Delhi, Delhi, India',
      father_name: null,
      address: {
        country: 'India',
        dist: 'New Delhi',
        state: 'Delhi',
        po: 'Connaught Place',
        house: '12B',
        loc: 'Central Delhi',
        vtc: 'Connaught Place',
        subdist: 'New Delhi',
        street: 'Main Road',
        landmark: 'Near Metro Station',
      },
    },
    xml_url: 'https://provider.example/rahul/aadhaar.xml?signature=secret',
  });

  assert.deepEqual(result, {
    clientId: 'digilocker_12345ABCDE',
    fullName: 'Rahul Kumar',
    fatherName: 'S/O: Mohan Kumar',
    careOf: 'S/O: Mohan Kumar',
    dob: '1995-05-15',
    yob: '1995',
    gender: 'M',
    mobileNumber: '9876543210',
    maskedAadhaar: 'XXXXXXXX1234',
    fullAddress: 'Connaught Place, New Delhi, Delhi, India',
    address: {
      country: 'India',
      district: 'New Delhi',
      state: 'Delhi',
      postOffice: 'Connaught Place',
      house: '12B',
      locality: 'Central Delhi',
      vtc: 'Connaught Place',
      subDistrict: 'New Delhi',
      street: 'Main Road',
      landmark: 'Near Metro Station',
      pincode: '110001',
    },
    profileImage: 'data:image/jpeg;base64,base64_encoded_image_string',
    xmlUrl: 'https://provider.example/rahul/aadhaar.xml?signature=secret',
  });
});
