import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SELL_VEHICLE_SAMPLE_MEDIA,
  getSellVehiclePreviewSource,
  getSellVehicleSampleMedia,
} from './sellVehicleSampleMedia.mjs';

test('maps every Sell Vehicle upload slot to the matching sample asset', () => {
  assert.equal(Object.keys(SELL_VEHICLE_SAMPLE_MEDIA).length, 14);
  assert.equal(getSellVehicleSampleMedia('front-view').src, '/sell-vehicle-samples/front.jpeg');
  assert.equal(getSellVehicleSampleMedia('dashboard-left').src, '/sell-vehicle-samples/dashbaordleft.jpeg');
  assert.equal(getSellVehicleSampleMedia('walkaround-video').kind, 'video');
});

test('uses an uploaded preview before falling back to the sample guidance', () => {
  assert.equal(
    getSellVehiclePreviewSource('front-view', '/uploads/actual-front.webp'),
    '/uploads/actual-front.webp'
  );
  assert.equal(
    getSellVehiclePreviewSource('front-view'),
    '/sell-vehicle-samples/front.jpeg'
  );
});
