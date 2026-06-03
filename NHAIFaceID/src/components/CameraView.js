import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat, useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { useRunOnJS } from 'react-native-worklets-core';
import Svg, { Ellipse, Line, Circle, Text as SvgText } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

// Mathematically generate a dense 468-point face mesh scaled to the bounding box
export function getFaceMesh468(box) {
  if (!box) return [];
  let { x, y, w, h } = box;
  
  if (isNaN(w) || w <= 0) w = 0.5;
  if (isNaN(h) || h <= 0) h = 0.5;
  if (isNaN(x)) x = 0.25;
  if (isNaN(y)) y = 0.25;

  const landmarks = [];

  // 1. Face Silhouette/Outline: 36 points
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

  // 2. Inner Face Contours: 3 rings of 36 = 108 points
  const ringRadii = [0.3, 0.2, 0.1];
  for (let r = 0; r < 3; r++) {
    const rad = ringRadii[r];
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * 2 * Math.PI;
      const rx = 0.5 + rad * Math.cos(angle);
      const ry = 0.5 + rad * 1.1 * Math.sin(angle);
      landmarks.push({ x: x + rx * w, y: y + ry * h });
    }
  }

  // 3. Forehead mesh grid: 5 rows of 12 = 60 points
  for (let row = 0; row < 5; row++) {
    const ry = 0.12 + 0.03 * row;
    for (let col = 0; col < 12; col++) {
      const rx = 0.25 + (0.5 / 11) * col;
      const offset = 0.02 * Math.sin((col / 11) * Math.PI);
      landmarks.push({ x: x + rx * w, y: y + (ry - offset) * h });
    }
  }

  // 4. Eyebrows: left (16), right (16) = 32 points
  for (let row = 0; row < 2; row++) {
    const baseRy = 0.26 + 0.02 * row;
    for (let i = 0; i < 8; i++) {
      const rx = 0.2 + 0.03 * i;
      const ry = baseRy - 0.03 * Math.sin((i / 7) * Math.PI);
      landmarks.push({ x: x + rx * w, y: y + ry * h });
    }
  }
  for (let row = 0; row < 2; row++) {
    const baseRy = 0.26 + 0.02 * row;
    for (let i = 0; i < 8; i++) {
      const rx = 0.56 + 0.03 * i;
      const ry = baseRy - 0.03 * Math.sin((i / 7) * Math.PI);
      landmarks.push({ x: x + rx * w, y: y + ry * h });
    }
  }

  // 5. Nose Structure: 54 points
  for (let row = 0; row < 6; row++) {
    const ry = 0.3 + 0.04 * row;
    for (let col = 0; col < 4; col++) {
      const rx = 0.47 + 0.02 * col;
      landmarks.push({ x: x + rx * w, y: y + ry * h });
    }
  }
  for (let row = 0; row < 6; row++) {
    const ry = 0.54 + 0.02 * row;
    for (let col = 0; col < 5; col++) {
      const rx = 0.4 + 0.05 * col;
      landmarks.push({ x: x + rx * w, y: y + ry * h });
    }
  }

  // 6. Eyes: Left (48), Right (48) = 96 points
  const eyeCenterL = { cx: 0.33, cy: 0.36 };
  const eyeCenterR = { cx: 0.67, cy: 0.36 };
  const eyeRadii = [0.06, 0.04, 0.02];
  for (let r = 0; r < 3; r++) {
    const rad = eyeRadii[r];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * 2 * Math.PI;
      const rxL = eyeCenterL.cx + rad * Math.cos(angle);
      const ryL = eyeCenterL.cy + rad * 0.7 * Math.sin(angle);
      landmarks.push({ x: x + rxL * w, y: y + ryL * h });
      const rxR = eyeCenterR.cx + rad * Math.cos(angle);
      const ryR = eyeCenterR.cy + rad * 0.7 * Math.sin(angle);
      landmarks.push({ x: x + rxR * w, y: y + ryR * h });
    }
  }

  // 7. Lips/Mouth area: 82 points
  const mouthCenter = { cx: 0.5, cy: 0.74 };
  const mouthRadii = [0.14, 0.10, 0.06];
  for (let r = 0; r < 3; r++) {
    const rad = mouthRadii[r];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * 2 * Math.PI;
      const rx = mouthCenter.cx + rad * Math.cos(angle);
      const ry = mouthCenter.cy + rad * 0.5 * Math.sin(angle);
      landmarks.push({ x: x + rx * w, y: y + ry * h });
    }
  }
  const mouthRadiiInner = [0.04, 0.02];
  for (let r = 0; r < 2; r++) {
    const rad = mouthRadiiInner[r];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      const rx = mouthCenter.cx + rad * Math.cos(angle);
      const ry = mouthCenter.cy + rad * 0.4 * Math.sin(angle);
      landmarks.push({ x: x + rx * w, y: y + ry * h });
    }
  }
  for (let i = 0; i < 10; i++) {
    const rx = 0.34 + 0.035 * i;
    const ry = 0.74;
    landmarks.push({ x: x + rx * w, y: y + ry * h });
  }

  return landmarks;
}

const CameraView = forwardRef(({ onFaceDetected, isActive = true, detectedFace = null }, ref) => {
  const camera = useRef(null);
  const [cameraPosition, setCameraPosition] = useState('front');
  const device = useCameraDevice(cameraPosition);
  const [layoutDims, setLayoutDims] = useState({ w: width, h: height });

  const format = useCameraFormat(device, [
    { photoResolution: { width: 640, height: 480 } },
    { videoResolution: { width: 640, height: 480 } }
  ]);

  const [hasPermission, setHasPermission] = useState(false);

  const handleLayout = (event) => {
    const { width: lw, height: lh } = event.nativeEvent.layout;
    setLayoutDims({ w: lw, h: lh });
  };
  
  const onFaceDetectedRef = useRef(onFaceDetected);
  useEffect(() => {
    onFaceDetectedRef.current = onFaceDetected;
  }, [onFaceDetected]);

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

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // ✅ CORRECT API for react-native-vision-camera-face-detector v1.8.x
  const { detectFaces } = useFaceDetector({
    performanceMode: 'fast',
    contourMode: 'none',
    landmarkMode: 'none',
    classificationMode: 'none',
    minFaceSize: 0.15,
    trackingEnabled: false,
    cameraFacing: cameraPosition,
    windowWidth: layoutDims.w,
    windowHeight: layoutDims.h,
  });

  const handleFaceResult = (box) => {
    if (onFaceDetectedRef.current) {
      const simulatedLandmarks = getFaceMesh468(box);
      onFaceDetectedRef.current(box, simulatedLandmarks, null);
    }
  };

  const handleNoFace = () => {
    if (onFaceDetectedRef.current) {
      onFaceDetectedRef.current(null, null, null);
    }
  };

  const runHandleFaceResult = useRunOnJS(handleFaceResult, []);
  const runHandleNoFace = useRunOnJS(handleNoFace, []);

  const frameCount = useRef(0);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!isActive) return;

    frameCount.current += 1;

    try {
      // ✅ Use the hook's detectFaces method - it's already a worklet
      const faces = detectFaces(frame);

      if (faces && faces.length > 0) {
        const face = faces[0];
        const bounds = face.bounds;
        const fw = frame.width || width;
        const fh = frame.height || height;
        
        const normalizedBox = {
          x: (bounds.x ?? 0) / fw,
          y: (bounds.y ?? 0) / fh,
          w: (bounds.width ?? bounds.w ?? 0) / fw,
          h: (bounds.height ?? bounds.h ?? 0) / fh,
        };

        runHandleFaceResult(normalizedBox);
      } else {
        if (frameCount.current % 5 === 0) {
          runHandleNoFace();
        }
      }
    } catch (e) {
      // Frame processor errors are silent - face not detected
      if (frameCount.current % 10 === 0) {
        runHandleNoFace();
      }
    }
  }, [isActive, detectFaces]);

  if (!hasPermission) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>📷 Camera permission required</Text>
        <Text style={styles.errorSub}>Please grant camera access in device settings</Text>
      </View>
    );
  }
  if (device == null) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No {cameraPosition} camera found</Text>
      </View>
    );
  }

  const isFront = cameraPosition === 'front';
  let activeBox = null;
  let activeColor = '#FFD700';
  let activeKeypoints = [];

  if (detectedFace && detectedFace.bbox) {
    activeBox = {
      x: isFront 
        ? (1.0 - (detectedFace.bbox.x + detectedFace.bbox.w)) * layoutDims.w 
        : detectedFace.bbox.x * layoutDims.w,
      y: detectedFace.bbox.y * layoutDims.h,
      w: detectedFace.bbox.w * layoutDims.w,
      h: detectedFace.bbox.h * layoutDims.h
    };
    activeColor = detectedFace.color || '#00FF00';
    activeKeypoints = (detectedFace.landmarks || []).map(kp => ({
      x: isFront ? (1.0 - kp.x) * layoutDims.w : kp.x * layoutDims.w,
      y: kp.y * layoutDims.h,
      name: kp.name || ''
    }));
  }

  const meshPoints = activeBox ? getFaceMesh468(activeBox) : [];

  // Guide oval parameters — centered in camera view
  const ovalCx = layoutDims.w / 2;
  const ovalCy = layoutDims.h * 0.45;
  const ovalRx = layoutDims.w * 0.38;
  const ovalRy = layoutDims.h * 0.30;
  const faceDetected = !!detectedFace;
  const guideColor = faceDetected ? (activeColor || '#00FF00') : 'rgba(255, 215, 0, 0.9)';

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo={true}
        format={format}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />

      {/* Guide Oval Overlay — always visible */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Dark overlay with cutout effect — top */}
        {/* Guide oval border with glow */}
        <Ellipse
          cx={ovalCx}
          cy={ovalCy}
          rx={ovalRx + 4}
          ry={ovalRy + 4}
          stroke={guideColor}
          strokeWidth="3"
          strokeOpacity="0.4"
          fill="none"
        />
        <Ellipse
          cx={ovalCx}
          cy={ovalCy}
          rx={ovalRx}
          ry={ovalRy}
          stroke={guideColor}
          strokeWidth="2.5"
          strokeDasharray={faceDetected ? "0" : "12,8"}
          fill="none"
          strokeOpacity="0.95"
        />

        {/* Corner accent marks */}
        {/* Top center */}
        <Line
          x1={ovalCx - 20} y1={ovalCy - ovalRy}
          x2={ovalCx + 20} y2={ovalCy - ovalRy}
          stroke={guideColor} strokeWidth="4" strokeLinecap="round"
        />
        {/* Bottom center */}
        <Line
          x1={ovalCx - 20} y1={ovalCy + ovalRy}
          x2={ovalCx + 20} y2={ovalCy + ovalRy}
          stroke={guideColor} strokeWidth="4" strokeLinecap="round"
        />
        {/* Left center */}
        <Line
          x1={ovalCx - ovalRx} y1={ovalCy - 20}
          x2={ovalCx - ovalRx} y2={ovalCy + 20}
          stroke={guideColor} strokeWidth="4" strokeLinecap="round"
        />
        {/* Right center */}
        <Line
          x1={ovalCx + ovalRx} y1={ovalCy - 20}
          x2={ovalCx + ovalRx} y2={ovalCy + 20}
          stroke={guideColor} strokeWidth="4" strokeLinecap="round"
        />

        {/* Face mesh dots overlay (only when face detected) */}
        {activeBox && meshPoints.slice(0, 200).map((pt, idx) => (
          <Circle
            key={`mesh-${idx}`}
            cx={pt.x}
            cy={pt.y}
            r="1.5"
            fill={activeColor === '#28a745' ? '#FFD700' : activeColor}
            opacity="0.6"
          />
        ))}

        {/* Bounding box when face detected */}
        {activeBox && (
          <>
            <Line
              x1={activeBox.x} y1={activeBox.y}
              x2={activeBox.x + activeBox.w} y2={activeBox.y}
              stroke={activeColor} strokeWidth="2" opacity="0.8"
            />
            <Line
              x1={activeBox.x + activeBox.w} y1={activeBox.y}
              x2={activeBox.x + activeBox.w} y2={activeBox.y + activeBox.h}
              stroke={activeColor} strokeWidth="2" opacity="0.8"
            />
            <Line
              x1={activeBox.x + activeBox.w} y1={activeBox.y + activeBox.h}
              x2={activeBox.x} y2={activeBox.y + activeBox.h}
              stroke={activeColor} strokeWidth="2" opacity="0.8"
            />
            <Line
              x1={activeBox.x} y1={activeBox.y + activeBox.h}
              x2={activeBox.x} y2={activeBox.y}
              stroke={activeColor} strokeWidth="2" opacity="0.8"
            />
          </>
        )}

        {/* Guidance label inside oval */}
        <SvgText
          x={ovalCx}
          y={ovalCy + ovalRy + 28}
          fill={guideColor}
          fontSize="13"
          fontWeight="bold"
          textAnchor="middle"
          opacity="0.9"
        >
          {faceDetected ? '✓ Face Detected' : 'Position face here'}
        </SvgText>
      </Svg>

      {/* Camera flip button */}
      <View style={styles.switchButton} pointerEvents="box-none">
        <Text 
          style={styles.switchText}
          onPress={() => setCameraPosition(prev => prev === 'front' ? 'back' : 'front')}
        >
          🔄 {cameraPosition === 'front' ? 'Front' : 'Back'}
        </Text>
      </View>

      {/* Bottom guidance bar */}
      <View style={styles.textOverlay} pointerEvents="none">
        <Text style={[styles.guidanceText, { color: faceDetected ? (activeColor || '#00FF00') : '#FFD700' }]}>
          {faceDetected ? '✅ Biometric Alignment Complete' : '👤 Align face inside guides...'}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
  },
  switchButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0, 48, 135, 0.85)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FFD700',
    zIndex: 10,
  },
  switchText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  textOverlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 48, 135, 0.75)',
    paddingVertical: 12,
  },
  guidanceText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
});

export default CameraView;
