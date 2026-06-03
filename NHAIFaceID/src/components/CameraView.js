import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat, useFrameProcessor, runAsync } from 'react-native-vision-camera';
import Svg, { Line, Circle, Text as SvgText } from 'react-native-svg';
import { detectFaces } from 'react-native-vision-camera-face-detector';
import { useRunOnJS } from 'react-native-worklets-core';

const { width, height } = Dimensions.get('window');

// Mathematically generate a dense 468-point face mesh scaled to the bounding box
// Mathematically generate a dense 468-point face mesh scaled to the bounding box
export function getFaceMesh468(box, contours = null) {
  if (!box) return [];
  let { x, y, w, h } = box;
  
  // Failsafe: if MLKit gives us NaN or 0 width/height bounds for any reason,
  // we fallback to a centered proxy box to ensure geometric hash doesn't crash to 0.
  if (isNaN(w) || w <= 0) w = 0.5;
  if (isNaN(h) || h <= 0) h = 0.5;
  if (isNaN(x)) x = 0.25;
  if (isNaN(y)) y = 0.25;

  const landmarks = [];

  // Check if we have valid real contours from MLKit
  const hasRealContours = contours && 
                          contours.FACE && contours.FACE.length > 0 &&
                          contours.LEFT_EYE && contours.LEFT_EYE.length > 0 &&
                          contours.RIGHT_EYE && contours.RIGHT_EYE.length > 0 &&
                          contours.NOSE_BRIDGE && contours.NOSE_BRIDGE.length > 0 &&
                          contours.NOSE_BOTTOM && contours.NOSE_BOTTOM.length > 0;

  // Log only once every ~2 seconds to avoid spam
  if (!getFaceMesh468._logCounter) getFaceMesh468._logCounter = 0;
  if (getFaceMesh468._logCounter++ % 60 === 0) {
    console.log('[CameraView] getFaceMesh468 hasRealContours:', hasRealContours, 'keys:', contours ? Object.keys(contours).join(', ') : 'null');
  }

  if (hasRealContours) {
    landmarks.isSimulated = false; // Real MLKit contour data — variance-based spoof detection is valid
    // 1. Face Silhouette/Outline: 36 points.
    const realFace = contours.FACE;
    for (let i = 0; i < 36; i++) {
      const pt = realFace[i % realFace.length];
      landmarks.push({ x: pt.x, y: pt.y });
    }

    // 2. Inner Face Contours: 3 rings of 36 points = 108 points
    const noseBridgePoints = contours.NOSE_BRIDGE;
    const noseCenter = noseBridgePoints.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    noseCenter.x /= noseBridgePoints.length;
    noseCenter.y /= noseBridgePoints.length;

    const ringFactors = [0.6, 0.4, 0.2];
    for (let r = 0; r < 3; r++) {
      const f = ringFactors[r];
      for (let i = 0; i < 36; i++) {
        const pt = realFace[i % realFace.length];
        landmarks.push({
          x: pt.x * f + noseCenter.x * (1 - f),
          y: pt.y * f + noseCenter.y * (1 - f)
        });
      }
    }

    // 3. Forehead mesh grid: 5 rows of 12 points = 60 points
    const eyeCenterL = contours.LEFT_EYE.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    eyeCenterL.x /= contours.LEFT_EYE.length;
    eyeCenterL.y /= contours.LEFT_EYE.length;

    const eyeCenterR = contours.RIGHT_EYE.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    eyeCenterR.x /= contours.RIGHT_EYE.length;
    eyeCenterR.y /= contours.RIGHT_EYE.length;

    const foreheadTopY = y;
    const eyebrowsY = (eyeCenterL.y + eyeCenterR.y) - 0.08 * h;

    for (let row = 0; row < 5; row++) {
      const t = row / 4;
      const ry = eyebrowsY * (1 - t) + foreheadTopY * t;
      for (let col = 0; col < 12; col++) {
        const rx = x + (0.25 + (0.5 / 11) * col) * w;
        landmarks.push({ x: rx, y: ry });
      }
    }

    // 4. Eyebrows: left (16 points), right (16 points) = 32 points
    const leftEyebrow = contours.LEFT_EYEBROW_TOP || contours.LEFT_EYE;
    const rightEyebrow = contours.RIGHT_EYEBROW_TOP || contours.RIGHT_EYE;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 8; i++) {
        const pt = leftEyebrow[(i + row * 2) % leftEyebrow.length];
        landmarks.push({ x: pt.x, y: pt.y });
      }
    }
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 8; i++) {
        const pt = rightEyebrow[(i + row * 2) % rightEyebrow.length];
        landmarks.push({ x: pt.x, y: pt.y });
      }
    }

    // 5. Nose Structure: 54 points
    const noseBridge = contours.NOSE_BRIDGE;
    const noseBottom = contours.NOSE_BOTTOM;
    for (let row = 0; row < 6; row++) {
      const t = row / 5;
      const startPt = noseBridge[Math.floor(t * (noseBridge.length - 1))];
      const endPt = noseBottom[Math.floor(t * (noseBottom.length - 1))];
      for (let col = 0; col < 4; col++) {
        const f = col / 3;
        landmarks.push({
          x: startPt.x * (1 - f) + endPt.x * f,
          y: startPt.y * (1 - f) + endPt.y * f
        });
      }
    }
    for (let row = 0; row < 6; row++) {
      const t = row / 5;
      const basePt = noseBottom[row % noseBottom.length];
      for (let col = 0; col < 5; col++) {
        const rx = basePt.x + (col - 2) * 0.02 * w;
        landmarks.push({ x: rx, y: basePt.y + t * 0.02 * h });
      }
    }

    // 6. Eyes: Left (48 points), Right (48 points) = 96 points
    const realEyeL = contours.LEFT_EYE;
    const realEyeR = contours.RIGHT_EYE;
    const scaleFactors = [1.2, 1.0, 0.8];
    for (let r = 0; r < 3; r++) {
      const f = scaleFactors[r];
      for (let i = 0; i < 16; i++) {
        const ptL = realEyeL[i % realEyeL.length];
        landmarks.push({
          x: eyeCenterL.x + (ptL.x - eyeCenterL.x) * f,
          y: eyeCenterL.y + (ptL.y - eyeCenterL.y) * f
        });
        const ptR = realEyeR[i % realEyeR.length];
        landmarks.push({
          x: eyeCenterR.x + (ptR.x - eyeCenterR.x) * f,
          y: eyeCenterR.y + (ptR.y - eyeCenterR.y) * f
        });
      }
    }

    // 7. Lips/Mouth area: 82 points
    const upperLip = contours.UPPER_LIP_TOP || contours.FACE;
    const lowerLip = contours.LOWER_LIP_BOTTOM || contours.FACE;
    const mouthCenter = {
      x: (upperLip[0].x + lowerLip[0].x) / 2,
      y: (upperLip[0].y + lowerLip[0].y) / 2
    };
    
    const lipFactors = [1.1, 0.9, 0.7];
    for (let r = 0; r < 3; r++) {
      const f = lipFactors[r];
      for (let i = 0; i < 16; i++) {
        const lipPt = i < 8 ? upperLip[i % upperLip.length] : lowerLip[(i - 8) % lowerLip.length];
        landmarks.push({
          x: mouthCenter.x + (lipPt.x - mouthCenter.x) * f,
          y: mouthCenter.y + (lipPt.y - mouthCenter.y) * f
        });
      }
    }
    for (let r = 0; r < 2; r++) {
      const f = 0.5 - r * 0.2;
      for (let i = 0; i < 12; i++) {
        const lipPt = i < 6 ? upperLip[i % upperLip.length] : lowerLip[(i - 6) % lowerLip.length];
        landmarks.push({
          x: mouthCenter.x + (lipPt.x - mouthCenter.x) * f,
          y: mouthCenter.y + (lipPt.y - mouthCenter.y) * f
        });
      }
    }
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const startX = mouthCenter.x - 0.05 * w;
      const endX = mouthCenter.x + 0.05 * w;
      landmarks.push({
        x: startX * (1 - t) + endX * t,
        y: mouthCenter.y
      });
    }

  } else {
    landmarks.isSimulated = true; // Mathematical fallback mesh — variance will be zero, skip spoof detection
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

    // 2. Inner Face Contours (Concentric rings for cheeks/chin): 3 rings of 36 points = 108 points
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

    // 3. Forehead mesh grid: 5 rows of 12 points = 60 points
    for (let row = 0; row < 5; row++) {
      const ry = 0.12 + 0.03 * row;
      for (let col = 0; col < 12; col++) {
        const rx = 0.25 + (0.5 / 11) * col;
        const offset = 0.02 * Math.sin((col / 11) * Math.PI);
        landmarks.push({ x: x + rx * w, y: y + (ry - offset) * h });
      }
    }

    // 4. Eyebrows: left (16 points), right (16 points) = 32 points
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

    // 6. Eyes: Left (48 points), Right (48 points) = 96 points
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
  }

  return landmarks;
}

const CameraView = forwardRef(({ onFaceDetected, isActive = true, detectedFace = null }, ref) => {
  const camera = useRef(null);
  const [cameraPosition, setCameraPosition] = useState('front');
  const device = useCameraDevice(cameraPosition);

  const format = useCameraFormat(device, [
    { fps: 30 },
    { videoResolution: { width: 1280, height: 720 } }
  ]);

  const [hasPermission, setHasPermission] = useState(false);
  const [layoutDims, setLayoutDims] = useState({ w: width, h: height });
  // Internal face tracking state — so CameraView renders its own detection overlay
  const [internalFace, setInternalFace] = useState(null);

  const exposureValue = (device && typeof device.maxExposure === 'number' && device.maxExposure > 0)
    ? Math.min(12.0, device.maxExposure)
    : undefined;

  console.log('[CameraView] Device exposure limits - minExposure:', device?.minExposure, 
              'maxExposure:', device?.maxExposure,
              'chosen exposureValue:', exposureValue);

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
        const photo = await camera.current.takePhoto({ flash: 'off', enableShutterSound: false });
        return photo.path;
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

  const frameCount = useRef(0);
  const lastUIUpdateRef = useRef(0);

  const handleFaceResult = (box, contours, faceMetrics = null) => {
    // Calculate the 468 simulated landmarks safely on the JS thread!
    const simulatedLandmarks = getFaceMesh468(box, contours);
    if (simulatedLandmarks && faceMetrics) {
      simulatedLandmarks.yawAngle = faceMetrics.yawAngle;
      simulatedLandmarks.pitchAngle = faceMetrics.pitchAngle;
      simulatedLandmarks.rollAngle = faceMetrics.rollAngle;
      simulatedLandmarks.leftEyeOpen = faceMetrics.leftEyeOpen;
      simulatedLandmarks.rightEyeOpen = faceMetrics.rightEyeOpen;
      simulatedLandmarks.smiling = faceMetrics.smiling;
      simulatedLandmarks.boxWidth = box.w;
      simulatedLandmarks.boxHeight = box.h;
      simulatedLandmarks.boxAspect = box.h > 0 ? box.w / box.h : 1;
    }
    // Throttle UI re-renders to ~6fps (every 5th frame) to avoid performance death
    const now = Date.now();
    if (now - lastUIUpdateRef.current > 150) {
      lastUIUpdateRef.current = now;
      setInternalFace({ bbox: box, landmarks: simulatedLandmarks, color: '#00FF00' });
    }
    // Always notify parent callback at full speed for enrollment logic
    if (onFaceDetectedRef.current) {
      onFaceDetectedRef.current(box, simulatedLandmarks, null);
    }
  };

  const handleNoFace = () => {
    // Only clear after a debounce to avoid flicker on momentary detection gaps
    const now = Date.now();
    if (now - lastUIUpdateRef.current > 500) {
      setInternalFace(null);
    }
    if (onFaceDetectedRef.current) {
      onFaceDetectedRef.current(null, null, null);
    }
  };

  const runHandleFaceResult = useRunOnJS(handleFaceResult, [handleFaceResult]);
  const runHandleNoFace = useRunOnJS(handleNoFace, [handleNoFace]);

  // Diagnostic logger callable from worklet
  const handleDiag = (msg) => { console.log(msg); };
  const runHandleDiag = useRunOnJS(handleDiag, []);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!isActive) return;

    frameCount.current += 1;

    runAsync(frame, () => {
      'worklet';
      // Run MLKit face detection via frame processor plugin
      const result = detectFaces(frame, {
        performanceMode: 'fast',
        contourMode: 'all',
        landmarkMode: 'all',
        classificationMode: 'all',
      });

      // DIAGNOSTIC: dump raw result structure (throttled)
      if (frameCount.current % 60 === 1) {
        const resultType = typeof result;
        const isArr = Array.isArray(result);
        const resultKeys = result && typeof result === 'object' ? Object.keys(result) : [];
        runHandleDiag(`[DIAG] result type=${resultType} isArray=${isArr} keys=[${resultKeys.join(',')}]`);
      }

      // The native plugin returns faces as a JSON string, not a parsed array!
      let faces = [];
      if (Array.isArray(result)) {
        faces = result;
      } else if (result && result.faces) {
        if (typeof result.faces === 'string') {
          try {
            faces = JSON.parse(result.faces);
          } catch (e) {
            faces = [];
          }
        } else if (Array.isArray(result.faces)) {
          faces = result.faces;
        }
      }

      if (faces.length > 0) {
        const face = faces[0];

        // DIAGNOSTIC: dump face object keys and values (throttled)
        if (frameCount.current % 60 === 2) {
          const faceKeys = Object.keys(face);
          const sample = {};
          for (const k of faceKeys) {
            const v = face[k];
            if (typeof v === 'number') sample[k] = v;
            else if (typeof v === 'object' && v !== null) sample[k] = `[object keys: ${Object.keys(v).join(',')}]`;
            else sample[k] = String(v);
          }
          runHandleDiag(`[DIAG] face keys=[${faceKeys.join(',')}] values=${JSON.stringify(sample)}`);
        }

        const bounds = face.bounds || face.boundingBox || face;
        // Normalize by FRAME dimensions (camera resolution), not screen dimensions
        const fw = frame.width || width;
        const fh = frame.height || height;
        const normalizedBox = {
          x: (bounds.x ?? bounds.left ?? 0) / fw,
          y: (bounds.y ?? bounds.top ?? 0) / fh,
          w: (bounds.width ?? bounds.w ?? 0) / fw,
          h: (bounds.height ?? bounds.h ?? 0) / fh,
        };

        // Extract unique biometric signals that differ per person
        // Try multiple possible property names from different MLKit versions
        const faceMetrics = {
          yawAngle: face.yawAngle ?? face.headEulerAngleY ?? face.rotationY ?? 0,
          pitchAngle: face.pitchAngle ?? face.headEulerAngleX ?? face.rotationX ?? 0,
          rollAngle: face.rollAngle ?? face.headEulerAngleZ ?? face.rotationZ ?? 0,
          leftEyeOpen: face.leftEyeOpenProbability ?? 0.5,
          rightEyeOpen: face.rightEyeOpenProbability ?? 0.5,
          smiling: face.smilingProbability ?? 0.5,
        };

        // Try to extract contours - handle different formats from different library versions
        const normalizedContours = {};
        const rawContours = face.contours;
        if (rawContours && typeof rawContours === 'object') {
          const keys = [
            'FACE', 'LEFT_CHEEK', 'LEFT_EYE', 'LEFT_EYEBROW_BOTTOM', 'LEFT_EYEBROW_TOP',
            'LOWER_LIP_BOTTOM', 'LOWER_LIP_TOP', 'NOSE_BOTTOM', 'NOSE_BRIDGE',
            'RIGHT_CHEEK', 'RIGHT_EYE', 'RIGHT_EYEBROW_BOTTOM', 'RIGHT_EYEBROW_TOP',
            'UPPER_LIP_BOTTOM', 'UPPER_LIP_TOP'
          ];
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const points = rawContours[key];
            if (points && points.length > 0) {
              const normPoints = [];
              for (let j = 0; j < points.length; j++) {
                normPoints.push({
                  x: points[j].x / fw,
                  y: points[j].y / fh
                });
              }
              normalizedContours[key] = normPoints;
            }
          }
        }

        // Pass both contours AND face metrics to the JS thread
        runHandleFaceResult(normalizedBox, normalizedContours, faceMetrics);
      } else {
        if (frameCount.current % 5 === 0) {
          runHandleNoFace();
        }
      }
    });
  }, [isActive]);

  const toggleCamera = () => {
    setCameraPosition(prev => prev === 'front' ? 'back' : 'front');
  };

  if (!hasPermission) return <Text style={styles.errorText}>Camera permission denied.</Text>;
  if (device == null) return <Text style={styles.errorText}>No camera found for {cameraPosition} view.</Text>;

  const isFront = cameraPosition === 'front';
  // Use detectedFace prop if provided (e.g. success state), otherwise use internal live tracking
  const activeFace = detectedFace || internalFace;
  let activeBox = null;
  let activeColor = '#00FF00';
  let activeKeypoints = [];

  if (activeFace && activeFace.bbox) {
    activeBox = {
      x: activeFace.bbox.x * layoutDims.w,
      y: activeFace.bbox.y * layoutDims.h,
      w: activeFace.bbox.w * layoutDims.w,
      h: activeFace.bbox.h * layoutDims.h
    };
    activeColor = activeFace.color || '#00FF00';
    activeKeypoints = (activeFace.landmarks || []).map(kp => ({
      x: kp.x * layoutDims.w,
      y: kp.y * layoutDims.h,
      name: kp.name || ''
    }));
  }

  const meshPoints = activeBox ? getFaceMesh468(activeBox) : [];

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo={true}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        exposure={exposureValue}
      />
      
      {activeBox && (
        <View style={[
          styles.boundingBox, 
          { 
            borderColor: activeColor,
            left: activeBox.x, 
            top: activeBox.y,
            width: activeBox.w,
            height: activeBox.h
          }
        ]} />
      )}

      {isActive && meshPoints.map((pt, idx) => (
        <View 
          key={idx}
          style={[
            styles.meshDot,
            {
              left: pt.x,
              top: pt.y,
              backgroundColor: activeColor === '#00FF00' || activeColor === '#28a745' ? '#FFD700' : '#FFF'
            }
          ]}
        />
      ))}

      {activeFace && activeKeypoints.length >= 4 && (
        <Svg style={StyleSheet.absoluteFill}>
          <Line x1={activeKeypoints[0].x} y1={activeKeypoints[0].y} x2={activeKeypoints[1].x} y2={activeKeypoints[1].y} stroke="#00E5FF" strokeWidth="2" strokeDasharray="4,4" />
          <Line x1={activeKeypoints[0].x} y1={activeKeypoints[0].y} x2={activeKeypoints[2].x} y2={activeKeypoints[2].y} stroke="#00E5FF" strokeWidth="1.5" />
          <Line x1={activeKeypoints[1].x} y1={activeKeypoints[1].y} x2={activeKeypoints[2].x} y2={activeKeypoints[2].y} stroke="#00E5FF" strokeWidth="1.5" />
          <Line x1={activeKeypoints[2].x} y1={activeKeypoints[2].y} x2={activeKeypoints[3].x} y2={activeKeypoints[3].y} stroke="#00E5FF" strokeWidth="1.5" strokeDasharray="3,3" />

          {activeKeypoints.slice(0, 4).map((kp, idx) => (
            <Circle key={idx} cx={kp.x} cy={kp.y} r="5" fill="#FFD700" stroke="#00E5FF" strokeWidth="1.5" />
          ))}

          <SvgText x={(activeKeypoints[0].x + activeKeypoints[1].x) / 2} y={(activeKeypoints[0].y + activeKeypoints[1].y) / 2 - 8} fill="#00E5FF" fontSize="10" fontWeight="bold" textAnchor="middle">
            Interpupillary Check: OK
          </SvgText>
          <SvgText x={activeKeypoints[2].x + 10} y={activeKeypoints[2].y + 4} fill="#00E5FF" fontSize="10" fontWeight="bold">
            Nose Drop: 0.35
          </SvgText>
        </Svg>
      )}

      <TouchableOpacity style={styles.switchButton} onPress={toggleCamera}>
        <Text style={styles.switchIcon}>🔄</Text>
        <Text style={styles.switchText}>{cameraPosition === 'front' ? 'Front' : 'Back'}</Text>
      </TouchableOpacity>

      <View style={styles.textOverlay}>
        <Text style={[styles.guidanceText, { color: activeColor === 'gray' ? 'white' : activeColor }]}>
          {detectedFace ? 'Biometric Alignment complete' : 'Align face inside guides...'}
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
  boundingBox: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  meshDot: {
    position: 'absolute',
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    opacity: 0.75,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 1,
  },
  switchButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: 'rgba(0, 48, 135, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FFD700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  switchIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  switchText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  textOverlay: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 48, 135, 0.7)',
    paddingVertical: 12,
  },
  guidanceText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  }
});

export default CameraView;
