import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity } from 'react-native';
import Svg, { Line, Circle, Text as SvgText, Defs, Mask, Rect, Ellipse } from 'react-native-svg';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Camera, useCameraDevice, useCameraFormat, useFrameProcessor, runAsync, VisionCameraProxy } from 'react-native-vision-camera';
import { useRunOnJS } from 'react-native-worklets-core';

const faceDetectorPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectFaces', {
  performanceMode: 'fast',
  contourMode: 'all',
  landmarkMode: 'all',
  classificationMode: 'all',
});

const { width, height } = Dimensions.get('window');

// Aspect ratio coordinate mapping utility
export function mapFrameToScreen(rawX, rawY, frameInfo, layoutDims, isFront) {
  if (!frameInfo || !frameInfo.fw || !frameInfo.fh) {
    return { x: rawX, y: rawY };
  }

  let { fw, fh } = frameInfo;
  const isPortrait = layoutDims.h > layoutDims.w;
  
  // Handle native sensor rotations (often returns landscape bounds in portrait mode)
  if (isPortrait && fw > fh) {
    fw = frameInfo.fh;
    fh = frameInfo.fw;
  } else if (!isPortrait && fh > fw) {
    fw = frameInfo.fh;
    fh = frameInfo.fw;
  }

  const frameAspect = fw / fh;
  const screenAspect = layoutDims.w / layoutDims.h;

  let scale, offsetX, offsetY;

  // React Native Camera's resizeMode="cover" logic
  if (frameAspect > screenAspect) {
    scale = layoutDims.h / fh;
    offsetX = (layoutDims.w - fw * scale) / 2;
    offsetY = 0;
  } else {
    scale = layoutDims.w / fw;
    offsetX = 0;
    offsetY = (layoutDims.h - fh * scale) / 2;
  }

  let screenX = rawX * scale + offsetX;
  let screenY = rawY * scale + offsetY;

  // Mirror the X coordinate for the front camera
  if (isFront) {
    screenX = layoutDims.w - screenX;
  }

  return { x: screenX, y: screenY };
}

// Mathematically generate a dense 468-point face mesh mapped to raw frame coordinates
export function getFaceMesh468(box, contours = null) {
  if (!box) return [];
  let { x, y, w, h } = box;
  
  if (isNaN(w) || w <= 0) w = 100;
  if (isNaN(h) || h <= 0) h = 100;
  if (isNaN(x)) x = 0;
  if (isNaN(y)) y = 0;

  const landmarks = [];

  const hasRealContours = contours && 
                          contours.FACE && contours.FACE.length > 0 &&
                          contours.LEFT_EYE && contours.LEFT_EYE.length > 0 &&
                          contours.RIGHT_EYE && contours.RIGHT_EYE.length > 0 &&
                          contours.NOSE_BRIDGE && contours.NOSE_BRIDGE.length > 0 &&
                          contours.NOSE_BOTTOM && contours.NOSE_BOTTOM.length > 0;

  if (!getFaceMesh468._logCounter) getFaceMesh468._logCounter = 0;
  if (getFaceMesh468._logCounter++ % 60 === 0) {
    console.log('[CameraView] getFaceMesh468 hasRealContours:', hasRealContours);
  }

  if (hasRealContours) {
    landmarks.isSimulated = false;
    const realFace = contours.FACE;
    for (let i = 0; i < 36; i++) {
      const pt = realFace[i % realFace.length];
      landmarks.push({ x: pt.x, y: pt.y });
    }

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

    const eyeCenterL = contours.LEFT_EYE.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    eyeCenterL.x /= contours.LEFT_EYE.length;
    eyeCenterL.y /= contours.LEFT_EYE.length;

    const eyeCenterR = contours.RIGHT_EYE.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    eyeCenterR.x /= contours.RIGHT_EYE.length;
    eyeCenterR.y /= contours.RIGHT_EYE.length;

    const foreheadTopY = y;
    const eyebrowsY = (eyeCenterL.y + eyeCenterR.y) / 2 - 0.08 * h;

    for (let row = 0; row < 5; row++) {
      const t = row / 4;
      const ry = eyebrowsY * (1 - t) + foreheadTopY * t;
      for (let col = 0; col < 12; col++) {
        const rx = x + (0.25 + (0.5 / 11) * col) * w;
        landmarks.push({ x: rx, y: ry });
      }
    }

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
    landmarks.isSimulated = true;
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

    for (let row = 0; row < 5; row++) {
      const ry = 0.12 + 0.03 * row;
      for (let col = 0; col < 12; col++) {
        const rx = 0.25 + (0.5 / 11) * col;
        const offset = 0.02 * Math.sin((col / 11) * Math.PI);
        landmarks.push({ x: x + rx * w, y: y + (ry - offset) * h });
      }
    }

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
  const [internalFace, setInternalFace] = useState(null);

  const faceDetectorOptions = React.useMemo(() => ({
    performanceMode: 'fast',
    contourMode: 'all',
    landmarkMode: 'all',
    classificationMode: 'all',
    autoMode: true,
    windowWidth: width,
    windowHeight: height,
    cameraFacing: cameraPosition
  }), [cameraPosition]);

  const exposureValue = device?.supportsExposureBias 
    ? Math.min(1.2, device.maxExposureBias ?? 1.2) 
    : undefined;

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
    },
    toggleCamera() {
      setCameraPosition(prev => prev === 'front' ? 'back' : 'front');
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

  const handleFaceResult = (box, contours, faceMetrics = null, frameInfo = null) => {
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

    const now = Date.now();
    if (now - lastUIUpdateRef.current > 150) {
      lastUIUpdateRef.current = now;
      setInternalFace({ bbox: box, landmarks: simulatedLandmarks, color: '#00FF00', frameInfo });
    }

    if (onFaceDetectedRef.current) {
      onFaceDetectedRef.current(box, simulatedLandmarks, null, frameInfo);
    }
  };

  const handleNoFace = () => {
    const now = Date.now();
    if (now - lastUIUpdateRef.current > 500) {
      setInternalFace(null);
    }
    if (onFaceDetectedRef.current) {
      onFaceDetectedRef.current(null, null, null, null);
    }
  };

  const runHandleFaceResult = useRunOnJS(handleFaceResult, [handleFaceResult]);
  const runHandleNoFace = useRunOnJS(handleNoFace, [handleNoFace]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!isActive) return;

    frameCount.current += 1;

    runAsync(frame, () => {
      'worklet';
      const result = faceDetectorPlugin.call(frame);

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
        const bounds = face.bounds || face.boundingBox || face;
        
        // Extract raw coordinates robustly for both iOS and Android MLKit payloads
        const bX = bounds.x ?? bounds.left ?? bounds.origin?.x ?? 0;
        const bY = bounds.y ?? bounds.top ?? bounds.origin?.y ?? 0;
        let bW = bounds.width ?? bounds.w ?? bounds.size?.width ?? 0;
        let bH = bounds.height ?? bounds.h ?? bounds.size?.height ?? 0;
        
        // Fallback if width/height is missing but right/bottom exists
        if (bW === 0 && bounds.right !== undefined) bW = bounds.right - bX;
        if (bH === 0 && bounds.bottom !== undefined) bH = bounds.bottom - bY;

        const rawBox = {
          x: bX,
          y: bY,
          w: bW,
          h: bH,
        };

        const faceMetrics = {
          yawAngle: face.yawAngle ?? face.headEulerAngleY ?? face.rotationY ?? 0,
          pitchAngle: face.pitchAngle ?? face.headEulerAngleX ?? face.rotationX ?? 0,
          rollAngle: face.rollAngle ?? face.headEulerAngleZ ?? face.rotationZ ?? 0,
          leftEyeOpen: face.leftEyeOpenProbability ?? 0.5,
          rightEyeOpen: face.rightEyeOpenProbability ?? 0.5,
          smiling: face.smilingProbability ?? 0.5,
        };

        const rawContours = {};
        const inputContours = face.contours;
        if (inputContours && typeof inputContours === 'object') {
          const keys = [
            'FACE', 'LEFT_CHEEK', 'LEFT_EYE', 'LEFT_EYEBROW_BOTTOM', 'LEFT_EYEBROW_TOP',
            'LOWER_LIP_BOTTOM', 'LOWER_LIP_TOP', 'NOSE_BOTTOM', 'NOSE_BRIDGE',
            'RIGHT_CHEEK', 'RIGHT_EYE', 'RIGHT_EYEBROW_BOTTOM', 'RIGHT_EYEBROW_TOP',
            'UPPER_LIP_BOTTOM', 'UPPER_LIP_TOP'
          ];
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const points = inputContours[key];
            if (points && points.length > 0) {
              const outPoints = [];
              for (let j = 0; j < points.length; j++) {
                // Keep raw pixel coordinates
                outPoints.push({ x: points[j].x, y: points[j].y });
              }
              rawContours[key] = outPoints;
            }
          }
        }

        runHandleFaceResult(rawBox, rawContours, faceMetrics, { fw: frame.width, fh: frame.height });
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
  const displayFace = detectedFace || internalFace;

  let activeBox = null;
  let activeColor = '#00FF00';
  let meshPoints = [];

  if (displayFace && displayFace.bbox) {
    // If frameInfo is missing (e.g. from an old cache), fallback gracefully
    const frameInfo = displayFace.frameInfo || { fw: Math.max(layoutDims.w, layoutDims.h), fh: Math.min(layoutDims.w, layoutDims.h) };
    
    const tl = mapFrameToScreen(displayFace.bbox.x, displayFace.bbox.y, frameInfo, layoutDims, isFront);
    const br = mapFrameToScreen(displayFace.bbox.x + displayFace.bbox.w, displayFace.bbox.y + displayFace.bbox.h, frameInfo, layoutDims, isFront);
    
    activeBox = {
      x: Math.min(tl.x, br.x),
      y: Math.min(tl.y, br.y),
      w: Math.abs(br.x - tl.x),
      h: Math.abs(br.y - tl.y)
    };

    activeColor = displayFace.color || '#00FF00';

    if (displayFace.landmarks) {
      meshPoints = displayFace.landmarks.map(kp => mapFrameToScreen(kp.x, kp.y, frameInfo, layoutDims, isFront));
    }
  }

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
        lowLightBoost={device?.supportsLowLightBoost}
        exposure={exposureValue}
      />
      
      {/* Center Oval Guide Overlay */}
      {isActive && (
        <Svg width="100%" height="100%" style={[StyleSheet.absoluteFill, { zIndex: 10 }]} pointerEvents="none">
          <Defs>
            <Mask id="ovalMask" x="0" y="0" width="100%" height="100%">
              <Rect x="0" y="0" width="100%" height="100%" fill="white" />
              <Ellipse
                cx={layoutDims.w / 2}
                cy={layoutDims.h * 0.42}
                rx={layoutDims.w * 0.32}
                ry={layoutDims.h * 0.26}
                fill="black"
              />
            </Mask>
          </Defs>
          
          <Rect x="0" y="0" width="100%" height="100%" fill="rgba(10, 15, 29, 0.75)" mask="url(#ovalMask)" />

          <Ellipse
            cx={layoutDims.w / 2}
            cy={layoutDims.h * 0.42}
            rx={layoutDims.w * 0.32}
            ry={layoutDims.h * 0.26}
            stroke={displayFace ? '#10B981' : '#00E5FF'}
            strokeWidth="3.5"
            strokeDasharray="12, 6"
            fill="none"
          />

          <Ellipse
            cx={layoutDims.w / 2}
            cy={layoutDims.h * 0.42}
            rx={layoutDims.w * 0.30}
            ry={layoutDims.h * 0.24}
            stroke="rgba(245, 196, 10, 0.4)"
            strokeWidth="1.5"
            fill="none"
          />
        </Svg>
      )}

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
              backgroundColor: (activeColor === '#00FF00' || activeColor === '#28a745' || activeColor === '#10B981') ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)'
            }
          ]}
        />
      ))}

      <TouchableOpacity style={styles.switchButton} onPress={toggleCamera}>
        <Text style={styles.switchIcon}>🔄</Text>
        <Text style={styles.switchText}>{cameraPosition === 'front' ? 'Front' : 'Back'}</Text>
      </TouchableOpacity>

      <View style={styles.textOverlay}>
        <Text style={[styles.guidanceText, { color: activeColor === 'gray' ? 'white' : activeColor }]}>
          {displayFace ? 'Biometric Alignment complete' : 'Align face inside guides...'}
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
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    marginLeft: -1.25,
    marginTop: -1.25,
    opacity: 0.6,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
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
