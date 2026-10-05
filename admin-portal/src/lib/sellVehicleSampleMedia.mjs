const sampleBasePath = '/sell-vehicle-samples';

export const SELL_VEHICLE_SAMPLE_MEDIA = Object.freeze({
  'front-view': { kind: 'image', src: `${sampleBasePath}/front.jpeg` },
  'rear-view': { kind: 'image', src: `${sampleBasePath}/rear.jpeg` },
  'left-side': { kind: 'image', src: `${sampleBasePath}/left.jpeg` },
  'right-side': { kind: 'image', src: `${sampleBasePath}/right.jpeg` },
  'front-left-angle': { kind: 'image', src: `${sampleBasePath}/frontleft.jpeg` },
  'front-right-angle': { kind: 'image', src: `${sampleBasePath}/frontright.jpg` },
  'rear-left-angle': { kind: 'image', src: `${sampleBasePath}/rearleft.jpeg` },
  'rear-right-angle': { kind: 'image', src: `${sampleBasePath}/rearright.jpeg` },
  'chassis-number': { kind: 'image', src: `${sampleBasePath}/chachisnumber.jpeg` },
  'meter-reading': { kind: 'image', src: `${sampleBasePath}/meterreading.jpeg` },
  'dashboard-front': { kind: 'image', src: `${sampleBasePath}/dashboardfront.jpg` },
  'dashboard-left': { kind: 'image', src: `${sampleBasePath}/dashbaordleft.jpeg` },
  'dashboard-right': { kind: 'image', src: `${sampleBasePath}/dashboardright.jpg` },
  'walkaround-video': { kind: 'video', src: `${sampleBasePath}/video.mp4` },
});

export const getSellVehicleSampleMedia = (slotKey) => SELL_VEHICLE_SAMPLE_MEDIA[slotKey] || null;

export const getSellVehiclePreviewSource = (slotKey, uploadedPreviewUrl = '') =>
  uploadedPreviewUrl || getSellVehicleSampleMedia(slotKey)?.src || '';
