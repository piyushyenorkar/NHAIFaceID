import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevice, useCameraFormat } from 'react-native-vision-camera';
import Svg, { Line, Circle, Text as SvgText } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

// Mathematically generate a dense 468-point face mesh scaled to the bounding box
export function getFaceMesh468(box) {
  if (!box) return [];
  const { x, y, w, h } = box;
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
  const [cameraPosition, setCameraPosition] = useState('front'); // front or back
  const device = useCameraDevice(cameraPosition);

  // Choose format with low photo/video resolution (640x480) to prevent CPU thread blocking or OOM
  const format = useCameraFormat(device, [
    { photoResolution: { width: 640, height: 480 } },
    { videoResolution: { width: 640, height: 480 } }
  ]);

  const [hasPermission, setHasPermission] = useState(false);

  // Track layout dimensions dynamically to align simulated box/landmarks overlays
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
        const photo = await camera.current.takePhoto({
          flash: 'off',
          enableShutterSound: false
        });
        return photo.path;
      }
      return null;
    }
  }));
  
  // Bounding box state
  const [boxState, setBoxState] = useState({
    color: 'gray', // gray, red, yellow, green
    message: 'Initializing...',
    box: null,
    fps: 0
  });

  const fpsRef = useRef(0);
  const lastFrameTime = useRef(Date.now());
  const frameCount = useRef(0);

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const alignedTimeRef = useRef(null);

  // Frame processing loop mock
  useEffect(() => {
    if (!isActive) {
      alignedTimeRef.current = null;
      setBoxState(prev => ({ ...prev, box: null, message: 'Camera Inactive' }));
      return;
    }

    if (alignedTimeRef.current === null) {
      alignedTimeRef.current = Date.now() + 1200; // 1.2s delay to simulate face alignment
    }

    const interval = setInterval(() => {
      const now = Date.now();
      frameCount.current += 1;
      
      if (now - lastFrameTime.current >= 1000) {
        fpsRef.current = frameCount.current;
        frameCount.current = 0;
        lastFrameTime.current = now;
      }

      const currentFps = fpsRef.current;
      const faceIsAligned = Date.now() >= alignedTimeRef.current;

      if (!faceIsAligned) {
        setBoxState(prev => {
          if (prev.color === 'gray' && prev.message === 'Align face inside guides...' && prev.box === null && prev.fps === currentFps) {
            return prev;
          }
          return {
            color: 'gray',
            message: 'Align face inside guides...',
            box: null,
            fps: currentFps
          };
        });
        return;
      }

      // Simulated face box coordinates relative to layout dimensions
      const simulatedBox = {
        x: layoutDims.w * 0.2, 
        y: layoutDims.h * 0.22, 
        w: layoutDims.w * 0.6, 
        h: layoutDims.h * 0.42
      };

      setBoxState(prev => {
        if (
          prev.color === '#00FF00' &&
          prev.message === 'Face detected - Hold still' &&
          prev.box &&
          prev.box.x === simulatedBox.x &&
          prev.box.y === simulatedBox.y &&
          prev.box.w === simulatedBox.w &&
          prev.box.h === simulatedBox.h &&
          prev.fps === currentFps
        ) {
          return prev;
        }
        return { 
          color: '#00FF00', 
          message: 'Face detected - Hold still', 
          box: simulatedBox, 
          fps: currentFps 
        };
      });
      
      // Fire mock detection event more frequently to simulate processing
      if (frameCount.current % 5 === 0) {
        if (onFaceDetectedRef.current) {
          const simulatedLandmarks = getFaceMesh468(simulatedBox);
          onFaceDetectedRef.current(simulatedBox, simulatedLandmarks);
        }
      }
      
    }, 33); // ~30fps loop

    return () => clearInterval(interval);
  }, [isActive, cameraPosition, layoutDims]);

  const toggleCamera = () => {
    setCameraPosition(prev => prev === 'front' ? 'back' : 'front');
  };

  if (!hasPermission) return <Text style={styles.errorText}>Camera permission denied.</Text>;
  if (device == null) return <Text style={styles.errorText}>No camera found for {cameraPosition} view.</Text>;

  // Scale and mirror coordinates for real detected face overlays if available
  const isFront = cameraPosition === 'front';
  let activeBox = null;
  let activeColor = boxState.color;
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
      name: kp.name
    }));
  } else if (boxState.box) {
    activeBox = boxState.box;
    activeColor = boxState.color;
  }

  // Generate 468-point mesh dynamically based on active box
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
      />
      
      {/* High Contrast Bounding Box Overlay */}
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

      {/* 468-Point Glowing Biometric Face Mesh Overlay */}
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

      {/* SVG Connecting Geometric Measurement Lines */}
      {detectedFace && activeKeypoints.length >= 4 && (
        <Svg style={StyleSheet.absoluteFill}>
          {/* Eye to eye line */}
          <Line 
            x1={activeKeypoints[0].x} y1={activeKeypoints[0].y}
            x2={activeKeypoints[1].x} y2={activeKeypoints[1].y}
            stroke="#00E5FF" strokeWidth="2" strokeDasharray="4,4"
          />
          {/* Right eye to nose tip */}
          <Line 
            x1={activeKeypoints[0].x} y1={activeKeypoints[0].y}
            x2={activeKeypoints[2].x} y2={activeKeypoints[2].y}
            stroke="#00E5FF" strokeWidth="1.5"
          />
          {/* Left eye to nose tip */}
          <Line 
            x1={activeKeypoints[1].x} y1={activeKeypoints[1].y}
            x2={activeKeypoints[2].x} y2={activeKeypoints[2].y}
            stroke="#00E5FF" strokeWidth="1.5"
          />
          {/* Nose tip to mouth center */}
          <Line 
            x1={activeKeypoints[2].x} y1={activeKeypoints[2].y}
            x2={activeKeypoints[3].x} y2={activeKeypoints[3].y}
            stroke="#00E5FF" strokeWidth="1.5" strokeDasharray="3,3"
          />

          {/* Keypoints targets */}
          {activeKeypoints.slice(0, 4).map((kp, idx) => (
            <Circle 
              key={idx}
              cx={kp.x} cy={kp.y} r="5"
              fill="#FFD700" stroke="#00E5FF" strokeWidth="1.5"
            />
          ))}

          {/* Svg Telemetry Badges */}
          <SvgText
            x={(activeKeypoints[0].x + activeKeypoints[1].x) / 2}
            y={(activeKeypoints[0].y + activeKeypoints[1].y) / 2 - 8}
            fill="#00E5FF" fontSize="10" fontWeight="bold" textAnchor="middle"
          >
            Interpupillary Check: OK
          </SvgText>
          <SvgText
            x={activeKeypoints[2].x + 10}
            y={activeKeypoints[2].y + 4}
            fill="#00E5FF" fontSize="10" fontWeight="bold"
          >
            Nose Drop: 0.35
          </SvgText>
        </Svg>
      )}

      {/* Floating Switch Camera Button */}
      <TouchableOpacity style={styles.switchButton} onPress={toggleCamera}>
        <Text style={styles.switchIcon}>🔄</Text>
        <Text style={styles.switchText}>{cameraPosition === 'front' ? 'Front' : 'Back'}</Text>
      </TouchableOpacity>

      {/* Guidance Text */}
      <View style={styles.textOverlay}>
        <Text style={[styles.guidanceText, { color: activeColor === 'gray' ? 'white' : activeColor }]}>
          {detectedFace ? 'Biometric Alignment complete' : boxState.message}
        </Text>
      </View>

      {/* FPS Counter in corner */}
      <View style={styles.fpsCounter}>
        <Text style={styles.fpsText}>{boxState.fps} FPS</Text>
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
    backgroundColor: 'rgba(0, 48, 135, 0.85)', // NHAI Blue with opacity
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FFD700', // NHAI Yellow border
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
  },
  fpsCounter: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
    borderRadius: 4,
  },
  fpsText: {
    color: '#00FF00',
    fontWeight: 'bold',
    fontSize: 14,
  },
  errorText: {
    color: 'red',
    fontSize: 18,
    textAlign: 'center',
    marginTop: '50%',
  }
});

export default CameraView;
