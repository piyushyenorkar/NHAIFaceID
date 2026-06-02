import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor, runAsync } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';

const { width, height } = Dimensions.get('window');

export default function CameraView({ onFaceDetected, isActive = true }) {
  const device = useCameraDevice('front');
  const [hasPermission, setHasPermission] = useState(false);
  
  const onFaceDetectedRef = useRef(onFaceDetected);
  useEffect(() => {
    onFaceDetectedRef.current = onFaceDetected;
  }, [onFaceDetected]);
  
  // Bounding box state
  const [boxState, setBoxState] = useState({
    color: 'gray', // gray, red, yellow, green
    message: 'Initializing...',
    box: null,
    fps: 0
  });

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // MLKit Face Detector Initialization
  const faceDetector = useFaceDetector({
    performanceMode: 'fast',
    runContours: false,
    runClassifications: true,
    runLandmarks: false,
    trackingEnabled: false,
  });

  // Bridge to send face data from the native C++ thread back to JavaScript UI
  const handleFacesOnJS = Worklets.createRunOnJS((faces) => {
    if (faces && faces.length > 0) {
      const face = faces[0];
      setBoxState({ 
        color: '#00FF00', 
        message: 'Face detected - Hold still', 
        box: {
          x: face.bounds.x, 
          y: face.bounds.y, 
          w: face.bounds.width, 
          h: face.bounds.height
        }, 
        fps: 30 
      });
      
      if (onFaceDetectedRef.current) {
        onFaceDetectedRef.current(face.bounds, null, face);
      }
    } else {
      setBoxState({ 
        color: 'gray', 
        message: 'Position your face in the frame', 
        box: null, 
        fps: 30 
      });
    }
  });

  // Native C++ Frame Processor (runs at 60fps)
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const faces = faceDetector.detectFaces(frame);
    handleFacesOnJS(faces);
  }, [faceDetector, handleFacesOnJS]);

  if (!hasPermission) return <Text style={styles.errorText}>Camera permission denied.</Text>;
  if (device == null) return <Text style={styles.errorText}>No front camera found.</Text>;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={frameProcessor}
        frameProcessorFps={15} // Cap detection at 15fps to save battery
      />
      
      {/* Dynamic Bounding Box Overlay */}
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
    borderWidth: 3,
    borderRadius: 12,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
  },
  textOverlay: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 10,
  },
  guidanceText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  }
});
