import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import CameraView from '../components/CameraView';

const CHALLENGES = [
  { id: 'BLINK', text: 'PLEASE BLINK YOUR EYES' },
  { id: 'TURN_LEFT', text: 'TURN HEAD LEFT' },
  { id: 'SMILE', text: 'PLEASE SMILE' }
];

export default function LivenessScreen({ navigation }) {
  const [activeChallenges, setActiveChallenges] = useState([]);
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [status, setStatus] = useState('PLAYING'); // PLAYING, PASSED_ONE, SUCCESS, FAILED
  
  const timerAnim = useState(new Animated.Value(100))[0];

  useEffect(() => {
    // Pick 2 random challenges
    const shuffled = [...CHALLENGES].sort(() => 0.5 - Math.random());
    setActiveChallenges(shuffled.slice(0, 2));
  }, []);

  useEffect(() => {
    if (status !== 'PLAYING') return;

    // Reset and start timer animation
    timerAnim.setValue(100);
    Animated.timing(timerAnim, {
      toValue: 0,
      duration: 15000,
      useNativeDriver: false
    }).start();

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setStatus('FAILED');
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentChallengeIndex, status]);

  const handleFaceDetected = (bbox, landmarks) => {
    if (status !== 'PLAYING') return;

    // Mocking the bridge to livenessDetection.js math logic
    // For demo UI purposes, we simulate passing the challenge randomly after 3 seconds
    if (timeLeft < 12) {
      handleChallengePassed();
    }
  };

  const handleChallengePassed = () => {
    if (currentChallengeIndex === 0) {
      setStatus('PASSED_ONE');
      setTimeout(() => {
        setCurrentChallengeIndex(1);
        setTimeLeft(15);
        setStatus('PLAYING');
      }, 1000);
    } else {
      setStatus('SUCCESS');
    }
  };

  const retry = () => {
    const shuffled = [...CHALLENGES].sort(() => 0.5 - Math.random());
    setActiveChallenges(shuffled.slice(0, 2));
    setCurrentChallengeIndex(0);
    setTimeLeft(15);
    setStatus('PLAYING');
  };

  // Determine timer bar color
  let timerColor = '#28a745'; // Green
  if (timeLeft <= 8) timerColor = '#fd7e14'; // Orange
  if (timeLeft <= 3) timerColor = '#dc3545'; // Red

  // Render Overlays
  if (status === 'SUCCESS') {
    return (
      <View style={[styles.overlayContainer, { backgroundColor: '#28a745' }]}>
        <Text style={styles.overlayText}>LIVENESS VERIFIED</Text>
        <Text style={styles.scoreText}>Score: 98.4%</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.btnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'FAILED') {
    return (
      <View style={[styles.overlayContainer, { backgroundColor: '#dc3545' }]}>
        <Text style={styles.overlayText}>LIVENESS FAILED</Text>
        <Text style={styles.scoreText}>Please retry</Text>
        <TouchableOpacity style={styles.btn} onPress={retry}>
          <Text style={styles.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentChallenge = activeChallenges[currentChallengeIndex];

  return (
    <View style={styles.container}>
      <CameraView isActive={status === 'PLAYING'} onFaceDetected={handleFaceDetected} />

      {/* Challenge Instruction */}
      {currentChallenge && (
        <View style={styles.instructionBanner}>
          <Text style={styles.instructionText}>{currentChallenge.text}</Text>
        </View>
      )}

      {/* Face Guide Oval */}
      <View style={styles.faceOvalWrapper}>
         <View style={styles.faceOval} />
      </View>

      {/* Flash Success Checkmark */}
      {status === 'PASSED_ONE' && (
        <View style={styles.checkmarkOverlay}>
          <Text style={styles.checkmark}>✅</Text>
        </View>
      )}

      {/* Bottom Bar: Timer & Dots */}
      <View style={styles.bottomBar}>
        <View style={styles.timerTrack}>
          <Animated.View style={[
            styles.timerFill, 
            { 
              width: timerAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              backgroundColor: timerColor 
            }
          ]} />
        </View>
        <View style={styles.dotsRow}>
          <Text style={styles.dot}>{currentChallengeIndex >= 0 ? '●' : '○'}</Text>
          <Text style={styles.dot}>{currentChallengeIndex >= 1 ? '●' : '○'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  instructionBanner: {
    position: 'absolute',
    top: 60,
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 12,
  },
  instructionText: {
    color: '#FFD700',
    fontSize: 32, // Note: scaled down slightly from 48sp for standard screens
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
  faceOvalWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none', // Allow touches to pass through
  },
  faceOval: {
    width: 250,
    height: 350,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 200,
    borderStyle: 'dashed',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  timerTrack: {
    width: '100%',
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
  },
  timerFill: {
    height: '100%',
  },
  dotsRow: {
    flexDirection: 'row',
  },
  dot: {
    color: '#FFF',
    fontSize: 24,
    marginHorizontal: 8,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayText: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  scoreText: {
    color: '#FFF',
    fontSize: 24,
    marginBottom: 40,
  },
  btn: {
    backgroundColor: '#FFF',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
  },
  btnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  checkmarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(40,167,69,0.4)',
  },
  checkmark: {
    fontSize: 100,
  }
});
