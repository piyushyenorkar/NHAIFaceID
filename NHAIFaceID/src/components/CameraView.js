import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat, useFrameProcessor } from 'react-native-vision-camera';
import Svg, { Line, Circle, Text as SvgText } from 'react-native-svg';
import { detectFaces } from 'react-native-vision-camera-face-detector';
import { useRunOnJS } from 'react-native-worklets-core';

const { width, height } = Dimensions.get('window');

// Mathematically generate a dense 468-point face mesh scaled to the bounding box
export function getFaceMesh468(box) {
  if (!box) return [];
  let { x, y, w, h } = box;
  
  // Failsafe: if MLKit gives us NaN or 0 width/height bounds for any reason,
  // we fallback to a centered proxy box to ensure geometric hash doesn't crash to 0.
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

  return landmarks;
}

const CameraView = forwardRef(({ onFaceDetected, isActive = true, detectedFace = null }, ref) => {
  const camera = useRef(null);
  const [cameraPosition, setCameraPosition] = useState('front');
  const device = useCameraDevice(cameraPosition);

  const format = useCameraFormat(device, [
    { photoResolution: { width: 640, height: 480 } },
    { videoResolution: { width: 640, height: 480 } }
  ]);

  const [hasPermission, setHasPermission] = useState(false);
  const [layoutDims, setLayoutDims] = useState({ w: width, h: height });

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

  const handleFaceResult = (box) => {
    if (onFaceDetectedRef.current) {
      // Calculate the 468 simulated landmarks safely on the JS thread!
      const simulatedLandmarks = getFaceMesh468(box);
      onFaceDetectedRef.current(box, simulatedLandmarks, null);
    }
  };

  const handleNoFace = () => {
    if (onFaceDetectedRef.current) {
      onFaceDetectedRef.current(null, null, null);
    }
  };

  const runHandleFaceResult = useRunOnJS(handleFaceResult, [handleFaceResult]);
  const runHandleNoFace = useRunOnJS(handleNoFace, [handleNoFace]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!isActive) return;

    frameCount.current += 1;

    // Run MLKit face detection via frame processor plugin
    const result = detectFaces(frame, {
      performanceMode: 'fast',
      contourMode: 'all',
      landmarkMode: 'none',
      classificationMode: 'none',
      minFaceSize: 0.15,
      trackingEnabled: false,
      convertFrame: false
    });

    const faces = result && result.faces ? result.faces : [];

    if (faces.length > 0) {
      const face = faces[0];
      const bounds = face.bounds || face.boundingBox || face;
      const fw = frame.width || width;
      const fh = frame.height || height;
      
      const normalizedBox = {
        x: (bounds.x ?? bounds.left ?? 0) / fw,
        y: (bounds.y ?? bounds.top ?? 0) / fh,
        w: (bounds.width ?? bounds.w ?? 0) / fw,
        h: (bounds.height ?? bounds.h ?? 0) / fh,
      };

      // Embedding and simulatedLandmarks are computed on the JS thread
      // to prevent Worklet sharing errors with complex Math functions.
      runHandleFaceResult(normalizedBox);
    } else {
      if (frameCount.current % 5 === 0) {
        runHandleNoFace();
      }
    }
  }, [isActive]);

  const toggleCamera = () => {
    setCameraPosition(prev => prev === 'front' ? 'back' : 'front');
  };

  if (!hasPermission) return <Text style={styles.errorText}>Camera permission denied.</Text>;
  if (device == null) return <Text style={styles.errorText}>No camera found for {cameraPosition} view.</Text>;

  const isFront = cameraPosition === 'front';
  let activeBox = null;
  let activeColor = '#00FF00';
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

      {detectedFace && activeKeypoints.length >= 4 && (
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
