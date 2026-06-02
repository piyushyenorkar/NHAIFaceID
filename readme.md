═══════════════════════════════════════════════════════════════
COMPLETE FILE STRUCTURE TO BUILD
═══════════════════════════════════════════════════════════════

NHAIFaceID/
│
├── App.js                          ← root navigation setup
├── package.json                    ← all dependencies
├── /src
│   │
│   ├── /config
│   │   └── config.js               ← AWS endpoint, thresholds, constants
│   │
│   ├── /models
│   │   ├── MobileFaceNet.tflite    ← face recognition (~2MB)
│   │   ├── face_detection_short_range.tflite  ← face detection (~2MB)
│   │   ├── face_landmark_68.tflite ← landmarks for liveness (~4MB)
│   │   └── model_manifest.json    ← model info + licenses
│   │
│   ├── /services
│   │   ├── faceDetection.js        ← wraps MediaPipe face detection
│   │   ├── faceRecognition.js      ← wraps MobileFaceNet, embedding logic
│   │   ├── livenessDetection.js    ← EAR blink, head turn, smile logic
│   │   ├── localStorage.js         ← all SQLite CRUD operations
│   │   └── awsSync.js              ← offline queue, sync, purge
│   │
│   ├── /screens
│   │   ├── HomeScreen.js           ← dashboard with stats + navigation
│   │   ├── EnrollScreen.js         ← enroll a new person's face
│   │   ├── LivenessScreen.js       ← run liveness challenge
│   │   ├── VerifyScreen.js         ← verify + identify a person
│   │   └── BenchmarkScreen.js      ← accuracy + speed test report
│   │
│   ├── /components
│   │   ├── CameraView.js           ← reusable camera with face overlay
│   │   └── SyncBanner.js           ← offline/syncing status banner
│   │
│   └── /utils
│       ├── metrics.js              ← timing + accuracy measurement
│       └── vectorMath.js           ← cosine similarity, dot product
│
├── /docs
│   ├── TECHNICAL_DOCUMENTATION.md ← integration guide + architecture
│   ├── presentation_outline.md    ← 10-slide deck content
│   └── API_REFERENCE.md           ← SDK public API for Datalake 3.0
│
└── /scripts
    └── download_models.js          ← downloads tflite models
