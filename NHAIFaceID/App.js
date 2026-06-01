import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import EnrollScreen from './src/screens/EnrollScreen';
import LivenessScreen from './src/screens/LivenessScreen';
import VerifyScreen from './src/screens/VerifyScreen';
import BenchmarkScreen from './src/screens/BenchmarkScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#003087', // NHAI Blue
          },
          headerTintColor: '#FFD700', // NHAI Yellow
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'Datalake 3.0', headerShown: false }} 
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
