import React, { useEffect, useState, useRef } from 'react';
import {
  PermissionsAndroid,
  Platform,
  StatusBar,
  Animated,
  StyleSheet,
  Image,
  View,
  Text,
  ActivityIndicator,
  NativeModules,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HybridWebView from './src/screens/HybridWebView';



function App() {
  const [showSplash, setShowSplash] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [webViewLoaded, setWebViewLoaded] = useState(false);

  useEffect(() => {
    // 2-second splash screen minimum timer
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 2000);

    if (Platform.OS === 'android' && NativeModules.NotificationClearer) {
      NativeModules.NotificationClearer.clearAll();
    }

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Hide splash screen only when 2 seconds have passed AND the webview has loaded
    if (minTimePassed && webViewLoaded) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setShowSplash(false);
      });
    }
  }, [minTimePassed, webViewLoaded, fadeAnim]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const requestLaunchPermissions = async () => {
      const permissions: string[] = [];

      if (Platform.Version >= 33) {
        permissions.push(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }

      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);

      try {
        await PermissionsAndroid.requestMultiple(permissions);
      } catch (error) {
        console.warn('Startup permission request failed', error);
      }
    };

    requestLaunchPermissions();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={showSplash ? 'dark-content' : 'dark-content'}
        backgroundColor={showSplash ? '#FFFFFF' : '#F7F7F8'}
        translucent={false}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1A1D20' }}>
        <HybridWebView onWebLoaded={() => setWebViewLoaded(true)} />
        {showSplash && (
          <Animated.View style={[StyleSheet.absoluteFill, styles.splashContainer, { opacity: fadeAnim }]}>
            <Image
              source={require('./src/assets/bg-pattern.png')}
              style={[StyleSheet.absoluteFill, { opacity: 0.08 }]}
              resizeMode="cover"
            />
            <Image
              source={require('./src/assets/mainlogo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <ActivityIndicator size="large" color="#FFB800" style={styles.loader} />
          </Animated.View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },

  logo: {
    width: 240,
    height: 240,
    marginBottom: 10,
  },
  loader: {
    marginVertical: 20,
  },
  welcomeText: {
    color: '#1A1D20',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});

export default App;
