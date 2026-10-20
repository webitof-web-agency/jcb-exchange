const sampleBasePath = '/sell-vehicle-samples';

export const SELL_VEHICLE_SAMPLE_MEDIA = Object.freeze({
  'front-view': {
    kind: 'image',
    src: `${sampleBasePath}/front.jpeg`,
    title: 'Front View',
    titleHi: 'सामने का दृश्य (फ्रंट व्यू)',
    subtitle: 'Full Frontal Bucket & Cabin Shot',
    subtitleHi: 'सामने का पूरा लोडर बकेट व केबिन',
    required: true,
    angle: 'Straight On (0°)',
    angleHi: 'सीधा सामने से (0°)',
    distance: '10–12 feet',
    distanceHi: '10–12 फीट',
    guideNote: 'Stand directly in front of the machine in daylight. Ensure the front loader bucket, headlights, front tyres, and cabin windshield are completely framed without cut-offs.',
    guideNoteHi: 'दिन की अच्छी रोशनी में मशीन के ठीक सामने खड़े होकर फोटो लें। ध्यान दें कि सामने का लोडर बकेट, हेडलाइट्स, आगे के दोनों टायर और केबिन विंडशील्ड बिना कटे पूरे फ्रेम में साफ आएं।',
    tips: [
      'Rest the loader bucket flat on the ground',
      'Ensure headlights and windshield are clear and free of sun reflection',
      'Shoot in landscape orientation from 10–12 feet away'
    ],
    tipsHi: [
      'लोडर बकेट को जमीन पर सीधा टिकाकर रखें',
      'हेडलाइट्स और शीशे साफ रखें तथा सूरज की सीधी चमक से बचें',
      '10–12 फीट की दूरी से मोबाइल को आड़ा (लैंडस्केप) रखकर फोटो खींचें'
    ]
  },
  'rear-view': {
    kind: 'image',
    src: `${sampleBasePath}/rear.jpeg`,
    title: 'Rear View',
    titleHi: 'पीछे का दृश्य (रियर व्यू)',
    subtitle: 'Backhoe Boom & Stabilizers Shot',
    subtitleHi: 'पीछे का एक्सकेवेटर बूम, बकेट व दोनों जैक',
    required: false,
    angle: 'Straight On (180°)',
    angleHi: 'सीधा पीछे से (180°)',
    distance: '10–12 feet',
    distanceHi: '10–12 फीट',
    guideNote: 'Capture a full, straight-on shot of the rear side. The backhoe boom, dipper arm, rear bucket, tail lights, and stabilizer legs must be clearly visible.',
    guideNoteHi: 'मशीन के बिल्कुल पीछे खड़े होकर पूरी फोटो लें। एक्सकेवेटर बूम, डिपर आर्म, पीछे का बकेट, टेल लाइट और दोनों स्टेबलाइजर लेग (जैक) पूरी तरह साफ दिखने चाहिए।',
    tips: [
      'Keep backhoe boom centered and locked in transport or lowered position',
      'Both hydraulic outriggers/stabilizers should be visible',
      'Ensure tail lamps and rear number plate area are legible'
    ],
    tipsHi: [
      'बूम को बीच में सीधा या नीचे सुरक्षित स्थिति में रखें',
      'दोनों हाइड्रोलिक जैक (स्टेबलाइजर) फ्रेम में स्पष्ट दिखने चाहिए',
      'टेल लाइट और पीछे की नंबर प्लेट वाली जगह साफ दिखाई दे'
    ]
  },
  'left-side': {
    kind: 'image',
    src: `${sampleBasePath}/left.jpeg`,
    title: 'Left Side Profile',
    titleHi: 'बाईं तरफ का पूरा दृश्य (लेफ्ट साइड)',
    subtitle: 'Complete Left Body & Tyres View',
    subtitleHi: 'बाईं बॉडी, केबिन गेट और दोनों टायर',
    required: false,
    angle: 'Direct Side (90°)',
    angleHi: 'सीधा बाईं तरफ से (90°)',
    distance: '12–15 feet',
    distanceHi: '12–15 फीट',
    guideNote: 'Capture a full side-profile from the left side showing front and rear tyres, cabin door, fuel/hydraulic tanks, and body paint condition.',
    guideNoteHi: 'मशीन के बाएं हिस्से से 12–15 फीट दूर खड़े होकर पूरी साइड प्रोफाइल लें। इसमें आगे और पीछे के टायर, केबिन का दरवाजा, डीजल/हाइड्रोलिक टैंक और बॉडी पेंट की स्थिति साफ दिखनी चाहिए।',
    tips: [
      'Keep camera at waist height to capture tyre tread depth and undercarriage clearance',
      'Ensure cabin door is closed and latched properly',
      'Frame the entire length of the vehicle from front bucket to rear boom'
    ],
    tipsHi: [
      'कैमरा कमर की ऊंचाई पर रखें ताकि टायर की गोटी (ट्रेड) और ग्राउंड क्लीयरेंस दिखे',
      'केबिन का दरवाजा ठीक से बंद रखें',
      'आगे के लोडर बकेट से लेकर पीछे के बूम तक पूरी मशीन फ्रेम में आनी चाहिए'
    ]
  },
  'right-side': {
    kind: 'image',
    src: `${sampleBasePath}/right.jpeg`,
    title: 'Right Side Profile',
    titleHi: 'दाईं तरफ का पूरा दृश्य (राइट साइड)',
    subtitle: 'Complete Right Body & Exhaust View',
    subtitleHi: 'दाईं बॉडी, साइलेंसर पाइप और दोनों टायर',
    required: false,
    angle: 'Direct Side (270°)',
    angleHi: 'सीधा दाईं तरफ से (270°)',
    distance: '12–15 feet',
    distanceHi: '12–15 फीट',
    guideNote: 'Capture the full right side profile showing the battery box, hydraulic oil tank, exhaust stack, right-side tyres, and chassis condition.',
    guideNoteHi: 'मशीन की दाईं तरफ से पूरी फोटो लें। इसमें बैटरी बॉक्स, हाइड्रोलिक ऑयल टैंक, साइलेंसर (एग्जॉस्ट पाइप), दाएं टायर और चेसिस की स्थिति स्पष्ट दिखनी चाहिए।',
    tips: [
      'Check for ambient daylight so repainted areas or scratches are honestly visible',
      'Ensure both right front and rear wheels are fully framed',
      'Keep machine straight without steering turned'
    ],
    tipsHi: [
      'पर्याप्त रोशनी में फोटो लें ताकि पेंट या स्क्रैच स्पष्ट रूप से दिखाई दें',
      'दाएं आगे और पीछे के दोनों पहिए पूरी तरह फ्रेम में होने चाहिए',
      'स्टीयरिंग को सीधा रखें ताकि टायर मुड़े हुए न दिखें'
    ]
  },
  'front-left-angle': {
    kind: 'image',
    src: `${sampleBasePath}/frontleft.jpeg`,
    title: 'Front-Left 45° Angle',
    titleHi: 'सामने-बाएं 45° कोना (कॉर्नर व्यू)',
    subtitle: '3D Perspective of Front Bucket & Left Cabin',
    subtitleHi: 'सामने लोडर और बाईं केबिन का 3D व्यू',
    required: false,
    angle: '45° Front-Left',
    angleHi: '45° आगे-बाएं',
    distance: '12–14 feet',
    distanceHi: '12–14 फीट',
    guideNote: 'Stand 45 degrees from the front-left corner. This angle provides buyers with an authentic 3D perspective of bucket width, lift cylinders, and left wheels.',
    guideNoteHi: 'आगे-बाएं कोने पर 45 डिग्री के एंगल पर खड़े हों। इस एंगल से ग्राहक को लोडर बकेट की चौड़ाई, लिफ्ट सिलेंडर और बाएं पहियों का सही 3D व्यू मिलता है।',
    tips: [
      'Shows loader linkage and left steer tyre simultaneously',
      'Ensures buyer can inspect cabin door clearance and step condition'
    ],
    tipsHi: [
      'लोडर लिंकेज और आगे का बायां स्टीयरिंग टायर एक साथ दिखते हैं',
      'केबिन में चढ़ने का पायदान (फुटस्टेप) और दरवाजा साफ दिखाई दे'
    ]
  },
  'front-right-angle': {
    kind: 'image',
    src: `${sampleBasePath}/frontright.jpg`,
    title: 'Front-Right 45° Angle',
    titleHi: 'सामने-दाएं 45° कोना (कॉर्नर व्यू)',
    subtitle: '3D Perspective of Front Loader & Right Body',
    subtitleHi: 'सामने लोडर और दाईं बॉडी का 3D व्यू',
    required: false,
    angle: '45° Front-Right',
    angleHi: '45° आगे-दाएं',
    distance: '12–14 feet',
    distanceHi: '12–14 फीट',
    guideNote: 'Stand 45 degrees from the front-right corner. Showcases the right loader lift arms, cabin pillars, and front axle steering linkage.',
    guideNoteHi: 'आगे-दाएं कोने पर 45 डिग्री के एंगल पर खड़े होकर फोटो लें। इसमें लोडर के लिफ्ट आर्म, केबिन पिलर और फ्रंट एक्सल स्टीयरिंग लिंकेज साफ दिखनी चाहिए।',
    tips: [
      'Ideal for inspecting right front tyre condition and bucket cutting edge',
      'Capture in wide landscape orientation'
    ],
    tipsHi: [
      'दाएं आगे के टायर की कंडीशन और लोडर बकेट के ब्लेड की जांच के लिए जरूरी है',
      'मोबाइल को आड़ा (वाइड लैंडस्केप) रखकर फोटो खींचें'
    ]
  },
  'rear-left-angle': {
    kind: 'image',
    src: `${sampleBasePath}/rearleft.jpeg`,
    title: 'Rear-Left 45° Angle',
    titleHi: 'पीछे-बाएं 45° कोना (रियर कॉर्नर)',
    subtitle: 'Backhoe Kingpost & Left Stabilizer',
    subtitleHi: 'किंगपोस्ट, स्विंग ब्रैकेट व बायां जैक',
    required: false,
    angle: '45° Rear-Left',
    angleHi: '45° पीछे-बाएं',
    distance: '12–14 feet',
    distanceHi: '12–14 फीट',
    guideNote: 'Capture the machine from 45 degrees behind the left side. Highlights the excavator swing bracket, left stabilizer pad, and boom cylinders.',
    guideNoteHi: 'पीछे की बाईं तरफ से 45 डिग्री एंगल पर फोटो लें। इससे एक्सकेवेटर का स्विंग ब्रैकेट (किंगपोस्ट), बायां जैक पैड और बूम सिलेंडर स्पष्ट दिखाई देते हैं।',
    tips: [
      'Check that hydraulic hoses and swing casting are clearly visible',
      'Captures left rear tyre tread depth clearly'
    ],
    tipsHi: [
      'हाइड्रोलिक पाइप (होस) और स्विंग कास्टिंग बिना किसी रुकावट के दिखनी चाहिए',
      'पीछे के बड़े बाएं टायर की गोटी साफ दिखाई दे'
    ]
  },
  'rear-right-angle': {
    kind: 'image',
    src: `${sampleBasePath}/rearright.jpeg`,
    title: 'Rear-Right 45° Angle',
    titleHi: 'पीछे-दाएं 45° कोना (रियर कॉर्नर)',
    subtitle: 'Backhoe Dipper & Right Stabilizer',
    subtitleHi: 'डिपर स्टिक, दायां जैक व बूम लॉक',
    required: false,
    angle: '45° Rear-Right',
    angleHi: '45° पीछे-दाएं',
    distance: '12–14 feet',
    distanceHi: '12–14 फीट',
    guideNote: 'Capture from 45 degrees behind the right side. Shows excavator dipper stick, right stabilizer outrigger, and boom lock mechanism.',
    guideNoteHi: 'पीछे की दाईं तरफ से 45 डिग्री पर फोटो लें। इसमें एक्सकेवेटर की डिपर स्टिक, दायां जैक और बूम लॉक का मैकेनिज्म साफ आना चाहिए।',
    tips: [
      'Ensures right rear tyre and boom structure are in focus',
      'Good lighting on backhoe bucket teeth'
    ],
    tipsHi: [
      'दायां बड़ा टायर और बूम स्ट्रक्चर पूरी तरह फोकस में हो',
      'पीछे के बकेट के दांतों (टीथ) पर अच्छी रोशनी हो'
    ]
  },
  'chassis-number': {
    kind: 'image',
    src: `${sampleBasePath}/chachisnumber.jpeg`,
    title: 'Chassis Number (VIN Plate)',
    titleHi: 'चेसिस नंबर (VIN प्लेट)',
    subtitle: 'Metal Stamped Identification Number',
    subtitleHi: 'धातु की प्लेट पर खुदा हुआ चेसिस नंबर',
    required: false,
    angle: 'Close-Up Top-Down',
    angleHi: 'बिल्कुल पास से (क्लोज-अप)',
    distance: '1–2 feet',
    distanceHi: '1–2 फीट',
    guideNote: 'Take a sharp, close-up photo of the metal stamped chassis number (VIN plate located on the loader frame or front pillar). Every letter and digit must be 100% legible.',
    guideNoteHi: 'लोडर फ्रेम या फ्रंट पिलर पर लगी मेटल चेसिस नंबर प्लेट की बिल्कुल पास से साफ फोटो लें। चेसिस नंबर का हर एक अक्षर और अंक 100% साफ पढ़ने लायक होना चाहिए।',
    tips: [
      'Wipe clean any grease, oil, or mud from the metal plate before photographing',
      'Avoid camera flash reflection directly on the metal stamping',
      'Ensure all 17 characters are sharp and unblurred for legal verification'
    ],
    tipsHi: [
      'फोटो लेने से पहले प्लेट पर लगी ग्रीस, तेल या मिट्टी को कपड़े से अच्छी तरह साफ कर लें',
      'कैमरे का फ्लैश सीधे प्लेट पर न मारें ताकि चमक से अक्षर छुप न जाएं',
      'वेरिफिकेशन के लिए सभी 17 अक्षर बिना धुंधलेपन के एकदम साफ होने चाहिए'
    ]
  },
  'meter-reading': {
    kind: 'image',
    src: `${sampleBasePath}/meterreading.jpeg`,
    title: 'Hour Meter / Odometer',
    titleHi: 'मीटर रीडिंग / घंटे (ऑवर मीटर)',
    subtitle: 'Operating Hours Counter Dial',
    subtitleHi: 'मशीन के चले हुए घंटे का मीटर',
    required: false,
    angle: 'Straight Cluster Shot',
    angleHi: 'सीधा मीटर के सामने से',
    distance: '1–2 feet',
    distanceHi: '1–2 फीट',
    guideNote: 'Turn the ignition key on to illuminate the digital or analog hour meter. Capture a clear, glare-free close-up of the exact operating hours.',
    guideNoteHi: 'मशीन की चाबी (इग्निशन) चालू करें ताकि डिजिटल या एनालॉग मीटर की लाइट जल जाए। चले हुए घंटों की बिल्कुल साफ और बिना चमक वाली क्लोज-अप फोटो लें।',
    tips: [
      'All digits showing running hours must be crystal clear',
      'Helps eliminate buyer disputes regarding meter tampering',
      'Capture steering gauge cluster in focus without steering obstruction'
    ],
    tipsHi: [
      'घंटे दर्शाने वाले सभी अंक बिल्कुल साफ दिखने चाहिए',
      'इससे खरीदार के साथ घंटों को लेकर कोई विवाद नहीं होता',
      'स्टीयरिंग व्हील को बीच में न आने दें, मीटर साफ दिखे'
    ]
  },
  'dashboard-front': {
    kind: 'image',
    src: `${sampleBasePath}/dashboardfront.jpg`,
    title: 'Dashboard (Front Center)',
    titleHi: 'डैशबोर्ड (सामने का मुख्य हिस्सा)',
    subtitle: 'Steering & Instrument Gauge Panel',
    subtitleHi: 'स्टीयरिंग व्हील और सभी गेज/मीटर पैनल',
    required: false,
    angle: 'Driver Eye Level',
    angleHi: 'ड्राइवर सीट की नजर से',
    distance: '2–3 feet',
    distanceHi: '2–3 फीट',
    guideNote: 'Sit in the operator seat and capture the front dashboard console including steering wheel, hazard/indicator switches, RPM dial, and ignition key area.',
    guideNoteHi: 'ड्राइवर सीट पर बैठकर सामने के डैशबोर्ड की फोटो लें, जिसमें स्टीयरिंग व्हील, आरपीएम मीटर, इंडिकेटर स्विच और चाबी लगाने की जगह पूरी तरह दिखाई दे।',
    tips: [
      'Shows overall clean condition of the interior cabin',
      'Ensure warning lights/indicators are clear'
    ],
    tipsHi: [
      'इससे केबिन के अंदर की साफ-सफाई और सही स्थिति का पता चलता है',
      'वार्निंग लाइटें और स्विच स्पष्ट दिखाई देने चाहिए'
    ]
  },
  'dashboard-left': {
    kind: 'image',
    src: `${sampleBasePath}/dashbaordleft.jpeg`,
    title: 'Dashboard & Controls (Left)',
    titleHi: 'केबिन कंट्रोल (बाईं तरफ)',
    subtitle: 'Transmission & Left Operator Console',
    subtitleHi: 'गियर लीवर, हैंडब्रेक व बायां कंसोल',
    required: false,
    angle: 'Operator Left View',
    angleHi: 'ऑपरेटर सीट के बाएं से',
    distance: '2–3 feet',
    distanceHi: '2–3 फीट',
    guideNote: 'Capture the left-hand console, shuttle / gear lever, handbrake, side control switches, and cabin floor condition.',
    guideNoteHi: 'बाईं तरफ का कंसोल, गियर लीवर, हैंडब्रेक, साइड कंट्रोल स्विच और केबिन के फर्श (मैट) की स्थिति की फोटो लें।',
    tips: [
      'Inspects cleanliness of cabin mats and lever boots',
      'Shows condition of side glass and door seals'
    ],
    tipsHi: [
      'केबिन मैट और गियर लीवर के रबर बूट की स्थिति दिखती है',
      'साइड ग्लास और दरवाजे की सील की सही जांच होती है'
    ]
  },
  'dashboard-right': {
    kind: 'image',
    src: `${sampleBasePath}/dashboardright.jpg`,
    title: 'Dashboard & Controls (Right)',
    titleHi: 'केबिन कंट्रोल (दाईं तरफ)',
    subtitle: 'Loader Levers & Excavator Joysticks',
    subtitleHi: 'लोडर लीवर, रेस लीवर व हाइड्रोलिक कंट्रोल',
    required: false,
    angle: 'Operator Right View',
    angleHi: 'ऑपरेटर सीट के दाएं से',
    distance: '2–3 feet',
    distanceHi: '2–3 फीट',
    guideNote: 'Capture the right operator controls including front loader hydraulic levers, backhoe controls, throttle lever, and side instrument pod.',
    guideNoteHi: 'दाईं तरफ के ऑपरेटर कंट्रोल की फोटो लें जिसमें सामने के लोडर के हाइड्रोलिक लीवर, एक्सकेवेटर कंट्रोल, रेस लीवर और साइड मीटर शामिल हों।',
    tips: [
      'Ensure hydraulic lever knobs and linkages are visible',
      'Shows operator console condition and care'
    ],
    tipsHi: [
      'हाइड्रोलिक लीवर के नॉब और लिंकेज साफ दिखने चाहिए',
      'मशीन की देखरेख और ऑपरेटर केबिन का रखरखाव साबित होता है'
    ]
  },
  'walkaround-video': {
    kind: 'video',
    src: `${sampleBasePath}/video.mp4`,
    title: '360° Walkaround & Engine Sound Video',
    titleHi: '360° वीडियो और इंजन आवाज',
    subtitle: 'Full Exterior, Tyre & Engine Running Clip',
    subtitleHi: 'पूरी मशीन का चक्कर व स्टार्ट इंजन की आवाज',
    required: true,
    angle: '360° Continuous Walk',
    angleHi: '360° चारों तरफ घूमते हुए',
    distance: '6–10 feet walking',
    distanceHi: '6–10 फीट की दूरी पर चलते हुए',
    guideNote: 'Start the engine and record a continuous 360-degree walkaround video. Show the machine idling, revving slightly, loader bucket movement, and all 4 tyres.',
    guideNoteHi: 'मशीन का इंजन स्टार्ट करें और चारों तरफ घूमते हुए 360 डिग्री का लगातार वीडियो बनाएं। वीडियो में इंजन की आवाज, थोड़ी रेस, लोडर बकेट का मूवमेंट और चारों टायर साफ दिखाएं।',
    tips: [
      'Shoot in landscape (horizontal) mode for marketplace viewing',
      'Keep duration between 30 to 90 seconds (Max 120s, Max 100MB)',
      'Walk steadily around the entire machine with clear engine audio'
    ],
    tipsHi: [
      'मोबाइल को आड़ा (हॉरिजॉन्टल/लैंडस्केप) रखकर वीडियो बनाएं',
      'वीडियो की लंबाई 30 से 90 सेकंड के बीच रखें (अधिकतम 120 सेकंड, 100MB)',
      'मशीन के चारों ओर धीरे-धीरे घूमें ताकि इंजन की आवाज साफ सुनाई दे'
    ]
  },
});

export const getSellVehicleSampleMedia = (slotKey) => SELL_VEHICLE_SAMPLE_MEDIA[slotKey] || null;

export const getSellVehiclePreviewSource = (slotKey, uploadedPreviewUrl = '') =>
  uploadedPreviewUrl || getSellVehicleSampleMedia(slotKey)?.src || '';
