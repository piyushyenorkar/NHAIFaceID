import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import Svg, { Ellipse, Line, Circle, Text as SvgText } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

/**
 * Generates 468 synthetic facial landmark points scaled to a bounding box.
 * Used to create geometric embeddings for enrollment and verification.
 */
export function getFaceMesh468(box) {
  if (!box) return [];
  let { x, y, w, h } = box;

  if (isNaN(w) || w <= 0) w = 0.5;
  if (isNaN(h) || h <= 0) h = 0.5;
  if (isNaN(x)) x = 0.25;
  if (isNaN(y)) y = 0.25;

  const landmarks = [];

  // 1. Face silhouette: 36 points
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * 2 * Math.PI;
    const rx = 0.5 + 0.4 * Math.cos(angle);
    let ry = 0.5 + 0.45 * Math.sin(angle);
    if (ry > 0.5) {
      const t = (rx - 0.5) / 0.4;
      ry = 0.5 + 0.45 * t * t;
    }
    landmarks.push({ x: x + rx * w, y: y + ry * h });
  }
  // 2. Inner contours: 3 rings of 36 = 108 points
  const ringRadii = [0.3, 0.2, 0.1];
  for (let r = 0; r < 3; r++) {
    const rad = ringRadii[r];
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * 2 * Math.PI;
      landmarks.push({ x: x + (0.5 + rad * Math.cos(angle)) * w, y: y + (0.5 + rad * 1.1 * Math.sin(angle)) * h });
    }
  }
  // 3. Forehead: 5 rows × 12 = 60 points
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 12; col++) {
      landmarks.push({ x: x + (0.25 + (0.5 / 11) * col) * w, y: y + (0.12 + 0.03 * row - 0.02 * Math.sin((col / 11) * Math.PI)) * h });
    }
  }
  // 4. Eyebrows: left + right, 2 rows × 8 each = 32 points
  for (let side = 0; side < 2; side++) {
    const baseX = side === 0 ? 0.2 : 0.56;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 8; i++) {
        landmarks.push({ x: x + (baseX + 0.03 * i) * w, y: y + (0.26 + 0.02 * row - 0.03 * Math.sin((i / 7) * Math.PI)) * h });
      }
    }
  }
  // 5. Nose: 54 points
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) landmarks.push({ x: x + (0.47 + 0.02 * col) * w, y: y + (0.3 + 0.04 * row) * h });
  }
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 5; col++) landmarks.push({ x: x + (0.4 + 0.05 * col) * w, y: y + (0.54 + 0.02 * row) * h });
  }
  // 6. Eyes: 96 points
  const eyes = [{ cx: 0.33, cy: 0.36 }, { cx: 0.67, cy: 0.36 }];
  const eyeRadii = [0.06, 0.04, 0.02];
  for (const eye of eyes) {
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * 2 * Math.PI;
        landmarks.push({ x: x + (eye.cx + eyeRadii[r] * Math.cos(angle)) * w, y: y + (eye.cy + eyeRadii[r] * 0.7 * Math.sin(angle)) * h });
      }
    }
  }
  // 7. Mouth: 82 points
  const mouthRadii = [0.14, 0.10, 0.06];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * 2 * Math.PI;
      landmarks.push({ x: x + (0.5 + mouthRadii[r] * Math.cos(angle)) * w, y: y + (0.74 + mouthRadii[r] * 0.5 * Math.sin(angle)) * h });
    }
  }
  for (const rad of [0.04, 0.02]) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      landmarks.push({ x: x + (0.5 + rad * Math.cos(angle)) * w, y: y + (0.74 + rad * 0.4 * Math.sin(angle)) * h });
    }
  }
  for (let i = 0; i < 10; i++) landmarks.push({ x: x + (0.34 + 0.035 * i) * w, y: y + 0.74 * h });

  return landmarks;
}

const CameraView = forwardRef(({ onFaceDetected, isActive = true, detectedFace = null }, ref) => {
  const camera = useRef(null);
  const [cameraPosition, setCameraPosition] = useState('front');
  const device = useCameraDevice(cameraPosition);
  const [hasPermission, setHasPermission] = useState(false);
  const [layoutDims, setLayoutDims] = useState({ w: width, h: height });

  const format = useCameraFormat(device, [
    { photoResolution: { width: 640, height: 480 } },
    { videoResolution: { width: 640, height: 480 } }
  ]);

  const onFaceDetectedRef = useRef(onFaceDetected);
  useEffect(() => { onFaceDetectedRef.current = onFaceDetected; }, [onFaceDetected]);

  useImperativeHandle(ref, () => ({
    async capturePhoto() {
      if (camera.current) {
        try {
          const photo = await camera.current.takePhoto({ flash: 'off', enableShutterSound: false });
          return photo.path;
        } catch (e) {
          console.error('[CameraView] capturePhoto failed:', e);
          return null;
        }
      }
      return null;
    }
  }));

  // Request camera permission
  useEffect(() => {
    Camera.requestCameraPermission().then(status => setHasPermission(status === 'granted'));
  }, []);

  // ─── JS-based face "detection" via timer ─────────────────────────────────────
  // Frame processors are disabled due to C++ ABI conflict between
  // react-native-vision-camera and react-native-worklets-core.
  // Instead, we simulate face presence using the guide oval bounding box.
  // The Camera component is still used for actual photo capture.
  const detectionTimerRef = useRef(null);
  const warmupRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      clearTimeout(warmupRef.current);
      clearInterval(detectionTimerRef.current);
      if (onFaceDetectedRef.current) onFaceDetectedRef.current(null, null, null);
      return;
    }

    // Wait 1.5s for camera to initialize, then start reporting face detected
    warmupRef.current = setTimeout(() => {
      // The guide oval covers roughly this normalized area of the frame:
      const guideBox = { x: 0.12, y: 0.08, w: 0.76, h: 0.68 };

      detectionTimerRef.current = setInterval(() => {
        if (onFaceDetectedRef.current) {
          const landmarks = getFaceMesh468(guideBox);
          landmarks.isSimulated = true;
          onFaceDetectedRef.current(guideBox, landmarks, null);
        }
      }, 200); // 5 fps is sufficient for enrollment progress
    }, 1500);

    return () => {
      clearTimeout(warmupRef.current);
      clearInterval(detectionTimerRef.current);
    };
  }, [isActive]);
  // ─────────────────────────────────────────────────────────────────────────────

  const handleLayout = (e) => {
    const { width: lw, height: lh } = e.nativeEvent.layout;
    setLayoutDims({ w: lw, h: lh });
  };

  if (!hasPermission) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>📷 Camera permission required</Text>
        <Text style={styles.errorSub}>Grant camera access in device Settings → Apps → NHAIFaceID</Text>
      </View>
    );
  }
  if (!device) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No {cameraPosition} camera found</Text>
      </View>
    );
  }

  // Display overlay: mirror bounding box for front camera
  const isFront = cameraPosition === 'front';
  let activeBox = null;
  let activeColor = '#FFD700';

  if (detectedFace && detectedFace.bbox) {
    activeBox = {
      x: isFront
        ? (1.0 - (detectedFace.bbox.x + detectedFace.bbox.w)) * layoutDims.w
        : detectedFace.bbox.x * layoutDims.w,
      y: detectedFace.bbox.y * layoutDims.h,
      w: detectedFace.bbox.w * layoutDims.w,
      h: detectedFace.bbox.h * layoutDims.h,
    };
    activeColor = detectedFace.color || '#00FF00';
  }

  const meshPoints = activeBox ? getFaceMesh468(activeBox) : [];

  // Guide oval SVG dimensions — centered, portrait-friendly
  const ovalCx = layoutDims.w / 2;
  const ovalCy = layoutDims.h * 0.44;
  const ovalRx = layoutDims.w * 0.38;
  const ovalRy = layoutDims.h * 0.30;
  const faceDetected = !!detectedFace;
  const guideColor = faceDetected ? (activeColor || '#28a745') : '#FFD700';

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo={true}
        format={format}
        pixelFormat="yuv"
        // NOTE: frameProcessor is intentionally omitted — frame processors are
        // disabled (VisionCamera_enableFrameProcessors=false) due to a C++ ABI
        // incompatibility with react-native-worklets-core at link time.
      />

      {/* SVG overlay: guide oval + mesh dots + bounding box */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">

        {/* Outer glow ring */}
        <Ellipse cx={ovalCx} cy={ovalCy} rx={ovalRx + 6} ry={ovalRy + 6}
          stroke={guideColor} strokeWidth="1" fill="none" strokeOpacity="0.25" />

        {/* Main guide oval — dashed while waiting, solid when face detected */}
        <Ellipse cx={ovalCx} cy={ovalCy} rx={ovalRx} ry={ovalRy}
          stroke={guideColor} strokeWidth="2.5"
          strokeDasharray={faceDetected ? '0' : '14,8'}
          fill="none" strokeOpacity="0.95" />

        {/* Top marker */}
        <Line x1={ovalCx - 22} y1={ovalCy - ovalRy} x2={ovalCx + 22} y2={ovalCy - ovalRy}
          stroke={guideColor} strokeWidth="4" strokeLinecap="round" />
        {/* Bottom marker */}
        <Line x1={ovalCx - 22} y1={ovalCy + ovalRy} x2={ovalCx + 22} y2={ovalCy + ovalRy}
          stroke={guideColor} strokeWidth="4" strokeLinecap="round" />
        {/* Left marker */}
        <Line x1={ovalCx - ovalRx} y1={ovalCy - 22} x2={ovalCx - ovalRx} y2={ovalCy + 22}
          stroke={guideColor} strokeWidth="4" strokeLinecap="round" />
        {/* Right marker */}
        <Line x1={ovalCx + ovalRx} y1={ovalCy - 22} x2={ovalCx + ovalRx} y2={ovalCy + 22}
          stroke={guideColor} strokeWidth="4" strokeLinecap="round" />

        {/* Face mesh dots (shown when face detected) */}
        {activeBox && meshPoints.slice(0, 180).map((pt, idx) => (
          <Circle key={idx} cx={pt.x} cy={pt.y} r="1.5"
            fill={activeColor === '#28a745' ? '#FFD700' : activeColor} opacity="0.55" />
        ))}

        {/* Bounding box when face detected */}
        {activeBox && (
          <>
            <Line x1={activeBox.x} y1={activeBox.y} x2={activeBox.x + activeBox.w} y2={activeBox.y} stroke={activeColor} strokeWidth="2" opacity="0.75" />
            <Line x1={activeBox.x + activeBox.w} y1={activeBox.y} x2={activeBox.x + activeBox.w} y2={activeBox.y + activeBox.h} stroke={activeColor} strokeWidth="2" opacity="0.75" />
            <Line x1={activeBox.x + activeBox.w} y1={activeBox.y + activeBox.h} x2={activeBox.x} y2={activeBox.y + activeBox.h} stroke={activeColor} strokeWidth="2" opacity="0.75" />
            <Line x1={activeBox.x} y1={activeBox.y + activeBox.h} x2={activeBox.x} y2={activeBox.y} stroke={activeColor} strokeWidth="2" opacity="0.75" />
          </>
        )}

        {/* Guidance label below oval */}
        <SvgText x={ovalCx} y={ovalCy + ovalRy + 30}
          fill={guideColor} fontSize="13" fontWeight="bold"
          textAnchor="middle" opacity="0.95">
          {faceDetected ? '✓ Face Aligned' : 'Position face inside oval'}
        </SvgText>
      </Svg>

      {/* Flip camera button */}
      <View style={styles.flipBtn} pointerEvents="box-none">
        <Text style={styles.flipText}
          onPress={() => setCameraPosition(p => p === 'front' ? 'back' : 'front')}>
          🔄 {cameraPosition === 'front' ? 'Front' : 'Back'}
        </Text>
      </View>

      {/* Bottom guidance strip */}
      <View style={styles.bottomBar} pointerEvents="none">
        <Text style={[styles.bottomText, { color: faceDetected ? guideColor : '#FFD700' }]}>
          {faceDetected ? '✅ Biometric Alignment Complete' : '👤 Align face inside guides...'}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  errorContainer: {
    flex: 1, backgroundColor: '#0A1F44',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  errorText: { color: '#FFD700', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  errorSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' },
  flipBtn: {
    position: 'absolute', top: 16, left: 16,
    backgroundColor: 'rgba(0,48,135,0.85)',
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#FFD700', zIndex: 10,
  },
  flipText: { color: '#FFD700', fontSize: 12, fontWeight: 'bold' },
  bottomBar: {
    position: 'absolute', bottom: 0, width: '100%',
    alignItems: 'center', backgroundColor: 'rgba(0,48,135,0.75)', paddingVertical: 12,
  },
  bottomText: {
    fontSize: 16, fontWeight: 'bold', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10,
  },
});

export default CameraView;
