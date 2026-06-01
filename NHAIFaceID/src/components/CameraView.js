import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';

// Note: In a full React Native environment, running JS models synchronously on 30fps frames
// often requires a Vision Camera Frame Processor plugin (e.g. vision-camera-face-detector).
// For the SDK, we simulate the frame processing bridge to the tfjs/mediapipe models.
import { detectFace } from '../services/faceDetection'; 

const { width, height } = Dimensions.get('window');

export default function CameraView({ onFaceDetected, isActive = true }) {
  const device = useCameraDevice('front');
  const [hasPermission, setHasPermission] = useState(false);
  
  // Bounding box state
  const [boxState, setBoxState] = useState({
    color: 'gray', // gray, red, yellow, green
    message: 'Initializing...',
    box: null,
    fps: 0
  });

  const lastFrameTime = useRef(Date.now());
  const frameCount = useRef(0);

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Frame processor for React Native Vision Camera
  // In production, this uses a native C++ plugin to pass frames to MediaPipe/TFLite
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    // 1. Calculate FPS
    const now = Date.now();
    frameCount.current += 1;
    let currentFps = boxState.fps;
    
    if (now - lastFrameTime.current >= 1000) {
      currentFps = frameCount.current;
      frameCount.current = 0;
      lastFrameTime.current = now;
    }

    // 2. Call Face Detection Model
    // (Bridged via runOnJS or native plugin for performance)
    // const result = runOnJS(detectFace)(frame);
    
    // Mocking the result evaluation for the UI component logic
    // const { detected, bbox, landmarks, multipleFaces } = result;
    
    /* 
    Logic executed in JS:
    if (multipleFaces) {
      setBoxState({ color: 'red', message: 'One face only please', box: bbox, fps: currentFps });
    } else if (detected) {
      // Check distance (width)
      if (bbox.w < 100) {
        setBoxState({ color: 'yellow', message: 'Move closer', box: bbox, fps: currentFps });
      } else if (bbox.w > 300) {
        setBoxState({ color: 'yellow', message: 'Move further back', box: bbox, fps: currentFps });
      } else {
        setBoxState({ color: '#00FF00', message: 'Face detected - Hold still', box: bbox, fps: currentFps });
        if (onFaceDetected) runOnJS(onFaceDetected)(bbox, landmarks);
      }
    } else {
      setBoxState({ color: 'gray', message: 'Looking for face...', box: null, fps: currentFps });
    }
    */
  }, []);

  if (!hasPermission) return <Text style={styles.errorText}>Camera permission denied.</Text>;
  if (device == null) return <Text style={styles.errorText}>No front camera found.</Text>;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={frameProcessor}
        frameProcessorFps={30}
      />
      
      {/* High Contrast Bounding Box Overlay */}
      {boxState.box && (
        <View style={[
          styles.boundingBox, 
          { 
            borderColor: boxState.color,
            left: boxState.box.x || width * 0.2, 
            top: boxState.box.y || height * 0.25,
            width: boxState.box.w || width * 0.6,
            height: boxState.box.h || height * 0.4
          }
        ]} />
      )}

      {/* Guidance Text */}
      <View style={styles.textOverlay}>
        <Text style={[styles.guidanceText, { color: boxState.color === 'gray' ? 'white' : boxState.color }]}>
          {boxState.message}
        </Text>
      </View>

      {/* FPS Counter in corner */}
      <View style={styles.fpsCounter}>
        <Text style={styles.fpsText}>{boxState.fps} FPS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  boundingBox: {
    position: 'absolute',
    borderWidth: 4,
    borderRadius: 12,
    backgroundColor: 'transparent',
    // High contrast shadow for outdoor visibility
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  textOverlay: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 48, 135, 0.7)', // NHAI Blue with opacity
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
    color: '#00FF00', // Bright green for benchmark
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
