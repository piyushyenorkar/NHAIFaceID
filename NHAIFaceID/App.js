import { registerTFJSPlatform } from './src/services/tfjsPlatform';
registerTFJSPlatform();
import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import NHAIFaceSDK from './src/NHAIFaceSDK';

LogBox.ignoreLogs(['Failed to initialize local TFJS Face Detector']);

import HomeScreen from './src/screens/HomeScreen';
import EnrollScreen from './src/screens/EnrollScreen';
import LivenessScreen from './src/screens/LivenessScreen';
import VerifyScreen from './src/screens/VerifyScreen';
import BenchmarkScreen from './src/screens/BenchmarkScreen';
import UserListScreen from './src/screens/UserListScreen';

const Stack = createStackNavigator();

export default function App() {
  useEffect(() => {
    NHAIFaceSDK.initialize().catch(console.error);
  }, []);
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#003087' },
          headerTintColor: '#FFD700',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'Datalake 3.0 — Field Auth' }} 
        />
        <Stack.Screen 
          name="Enroll" 
          component={EnrollScreen} 
          options={{ title: 'Enroll Personnel' }} 
        />
        <Stack.Screen 
          name="Liveness" 
          component={LivenessScreen} 
          options={{ title: 'Liveness Check' }} 
        />
        <Stack.Screen 
          name="Verify" 
          component={VerifyScreen} 
          options={{ title: 'Verify Identity' }} 
        />
        <Stack.Screen 
          name="Benchmark" 
          component={BenchmarkScreen} 
          options={{ title: 'System Benchmark' }} 
        />
        <Stack.Screen 
          name="UserList" 
          component={UserListScreen} 
          options={{ title: 'Biometric Registry' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
