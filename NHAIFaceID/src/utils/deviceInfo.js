import { Platform } from 'react-native';

/**
 * Retrieves basic device telemetry for debugging and analytics logs.
 */
export const getDeviceInfo = () => {
  return {
    os: Platform.OS,
    osVersion: Platform.Version,
    appVersion: '1.0.0',
    deviceModel: Platform.OS === 'android' ? 'Android Device' : 'iOS Device',
    isTablet: Platform.isPad || false,
  };
};

/**
 * Generates a unique offline device ID if one doesn't exist.
 */
export const generateDeviceId = () => {
  return 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
};
