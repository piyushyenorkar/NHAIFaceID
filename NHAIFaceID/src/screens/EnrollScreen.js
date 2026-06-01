import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import CameraView from '../components/CameraView';
import { generateEmbedding } from '../services/faceRecognition';
// import { insertEnrolledFace } from '../services/databaseService'; // Mocked for UI phase

export default function EnrollScreen({ navigation }) {
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0); // 0 to 5
  const [enrolled, setEnrolled] = useState(false);

  const startEnrollment = () => {
    if (!employeeId.trim() || !name.trim()) {
      Alert.alert('Validation Error', 'Employee ID and Full Name are mandatory.');
      return;
    }
    setIsCapturing(true);
    setCaptureProgress(0);
  };

  const handleFaceDetected = async (bbox, landmarks) => {
    if (!isCapturing || captureProgress >= 5) return;

    // Simulate capturing 5 solid frames for embedding averaging
    setCaptureProgress(prev => prev + 1);

    if (captureProgress + 1 === 5) {
      // Done capturing
      setIsCapturing(false);
      
      // Mock embedding generation & saving
      // const embedding = await generateEmbedding(frameTensor);
      // await insertEnrolledFace(employeeId, name, embedding);

      setEnrolled(true);
    }
  };

  if (enrolled) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successTitle}>✅ Enrollment Successful</Text>
        <Text style={styles.successText}>Name: {name}</Text>
        <Text style={styles.successText}>Employee ID: {employeeId}</Text>
        <Text style={styles.timestamp}>Enrolled on: {new Date().toLocaleString()}</Text>
        
        <TouchableOpacity 
          style={styles.doneBtn} 
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.doneBtnText}>Return Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Input Form */}
      <View style={styles.formContainer}>
        <TextInput 
          style={styles.input}
          placeholder="Employee ID"
          value={employeeId}
          onChangeText={setEmployeeId}
          editable={!isCapturing}
        />
        <TextInput 
          style={styles.input}
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
          editable={!isCapturing}
        />

        {!isCapturing && (
          <TouchableOpacity style={styles.startBtn} onPress={startEnrollment}>
            <Text style={styles.startBtnText}>Start Enrollment</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Camera Area */}
      <View style={styles.cameraWrapper}>
        <CameraView 
          isActive={isCapturing}
          onFaceDetected={handleFaceDetected}
        />
        
        {/* Progress Overlay */}
        {isCapturing && (
          <View style={styles.progressOverlay}>
            <Text style={styles.progressText}>
              Capturing... {captureProgress}/5
            </Text>
            <Text style={styles.instructionText}>
              Position your face in the oval and hold still
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  formContainer: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  startBtn: {
    backgroundColor: '#003087',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  progressOverlay: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 30,
    alignItems: 'center',
  },
  progressText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  instructionText: {
    color: '#FFF',
    fontSize: 14,
    marginTop: 4,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
  },
  successTitle: {
    fontSize: 28,
    color: '#28a745',
    fontWeight: 'bold',
    marginBottom: 24,
  },
  successText: {
    fontSize: 18,
    color: '#333',
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 16,
    marginBottom: 32,
  },
  doneBtn: {
    backgroundColor: '#003087',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  doneBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
