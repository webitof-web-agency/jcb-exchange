import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View,
  PermissionsAndroid,
  Platform,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import messaging from '@react-native-firebase/messaging';
import { getWebAppUrl, getWebAppUrlHint } from '../config/webApp';
import { buildFcmSyncScript } from '../lib/fcmBridge';
import { getApiBaseUrl } from '../config/firebase';

interface Props {
  onWebLoaded?: () => void;
}

function HybridWebView({ onWebLoaded }: Props) {
  const webViewRef = useRef<any>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fcmToken, setFcmToken] = useState<string>('');
  const [webReady, setWebReady] = useState(false);
  const webAppUrl = getWebAppUrl();
  const apiBaseUrl = getApiBaseUrl();
  const [currentUrl, setCurrentUrl] = useState(webAppUrl);

  const syncFcmToken = useCallback(
    (token: string) => {
      if (!token || !webReady || !webViewRef.current) {
        return;
      }

      webViewRef.current.injectJavaScript(
        buildFcmSyncScript({
          apiBaseUrl,
          fcmToken: token,
        }),
      );
    },
    [apiBaseUrl, webReady],
  );

  const retry = useCallback(() => {
    setErrorMessage(null);
    setLoading(true);
    setCanGoBack(false);
    setWebReady(false);
    setReloadKey((value) => value + 1);
  }, []);

  const openExternalLink = useCallback((url: string) => {
    Linking.openURL(url).catch(() => undefined);
  }, []);

  useEffect(() => {
    const requestFcmToken = async () => {
      try {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log('Notification permission denied');
          }
        } else if (Platform.OS === 'ios') {
          await messaging().requestPermission();
        }

        await messaging().registerDeviceForRemoteMessages();
        const token = await messaging().getToken();
        if (token) {
          console.log('====================================');
          console.log('📱 FCM TOKEN GENERATED FOR THIS DEVICE:', token);
          console.log('====================================');
          setFcmToken(token);
        }
      } catch (error) {
        console.warn('FCM token setup failed', error);
      }
    };

    requestFcmToken();

    const unsubscribeRefresh = messaging().onTokenRefresh((token) => {
      if (token) {
        setFcmToken(token);
      }
    });

    return unsubscribeRefresh;
  }, []);

  useEffect(() => {
    syncFcmToken(fcmToken);
  }, [fcmToken, syncFcmToken]);

  useEffect(() => {
    if (webReady && fcmToken) {
      syncFcmToken(fcmToken);
    }
  }, [webReady, fcmToken, syncFcmToken]);

  const handleNotificationNavigation = useCallback((data?: Record<string, string>) => {
    const rawPath = data?.path || data?.url || data?.link;
    if (!rawPath) return;

    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
      setCurrentUrl(rawPath);
    } else {
      const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
      const cleanWebUrl = webAppUrl.replace(/\/$/, '');
      setCurrentUrl(`${cleanWebUrl}${cleanPath}`);
    }
  }, [webAppUrl]);

  useEffect(() => {
    // 1. App in Background: User taps notification
    const unsubscribeOnNotificationOpenedApp = messaging().onNotificationOpenedApp(
      (remoteMessage) => {
        if (remoteMessage?.data) {
          handleNotificationNavigation(remoteMessage.data as Record<string, string>);
        }
      }
    );

    // 2. Foreground notification handler with View action
    const unsubscribeOnMessage = messaging().onMessage(async remoteMessage => {
      console.log('🔔 FIREBASE NOTIFICATION RECEIVED IN FOREGROUND:', JSON.stringify(remoteMessage, null, 2));
      
      const title = remoteMessage.notification?.title || remoteMessage.data?.title || 'Notification';
      const body = remoteMessage.notification?.body || remoteMessage.data?.body || '';
      const hasAction = Boolean(remoteMessage.data?.path || remoteMessage.data?.url || remoteMessage.data?.link);

      if (hasAction) {
        Alert.alert(
          title,
          body,
          [
            { text: 'Dismiss', style: 'cancel' },
            {
              text: 'View Details',
              onPress: () => handleNotificationNavigation(remoteMessage.data as Record<string, string>),
            },
          ],
          { cancelable: true }
        );
      } else {
        Alert.alert(title, body);
      }
    });

    // 3. App completely Closed (Quit State): User taps notification
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage?.data) {
          handleNotificationNavigation(remoteMessage.data as Record<string, string>);
        }
      });

    // 4. Clear all push notifications when app comes to foreground
    const clearAllNotifications = () => {
      try {
        if (Platform.OS === 'android') {
          const NotificationClearer = NativeModules.NotificationClearer;
          if (NotificationClearer?.clearAll) {
            NotificationClearer.clearAll();
          }
        }
      } catch (e) {
        console.warn('Could not clear notifications:', e);
      }
    };

    clearAllNotifications();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        clearAllNotifications();
      }
    });

    return () => {
      unsubscribeOnNotificationOpenedApp();
      unsubscribeOnMessage();
      appStateSubscription.remove();
    };
  }, [webAppUrl, handleNotificationNavigation]);

  // Removed initialPath injection effect since we now use currentUrl state

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [canGoBack]);

  if (errorMessage) {
    return (
      <View style={styles.fallbackContainer}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>⚠️</Text>
        </View>
        <Text style={styles.title}>Oops!</Text>
        <Text style={styles.subtitle}>
          We couldn't connect to the server. Please check your internet connection and try again.
        </Text>

        <Pressable style={styles.button} onPress={retry}>
          <Text style={styles.buttonLabel}>Try Again</Text>
        </Pressable>

        <View style={{ marginTop: 40, width: '100%' }}>
          <Text style={{ textAlign: 'center', fontSize: 14, color: '#64748B', marginBottom: 12, fontWeight: '600' }}>
            Need Help? Contact Support
          </Text>
          <View style={styles.supportBox}>
            <Pressable style={styles.supportItem} onPress={() => openExternalLink('mailto:support@jcbexchange.com')}>
              <Text style={styles.supportLabel}>Customer Support Email</Text>
              <Text style={styles.supportLink}>support@jcbexchange.com</Text>
            </Pressable>
            <Pressable style={styles.supportItem} onPress={() => openExternalLink('whatsapp://send?phone=917451965755')}>
              <Text style={styles.supportLabel}>WhatsApp Support</Text>
              <Text style={styles.supportLink}>+91 7451965755</Text>
            </Pressable>
            <Pressable style={styles.supportItemLast} onPress={() => openExternalLink('mailto:business@jcbexchange.com')}>
              <Text style={styles.supportLabel}>Partner / Agent Inquiry</Text>
              <Text style={styles.supportLink}>business@jcbexchange.com</Text>
            </Pressable>
          </View>
        </View>
        
        <Text style={[styles.hint, { marginTop: 10, textAlign: 'center' }]}>
          Error: {errorMessage}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        key={reloadKey}
        ref={webViewRef}
        source={{ uri: currentUrl }}
        userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36 ReactNativeWebView"
        applicationNameForUserAgent="ReactNativeWebView"
        originWhitelist={['http://*', 'https://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        cacheEnabled
        onLoadStart={() => {
          setLoading(true);
          setErrorMessage(null);
        }}
        onLoadEnd={() => {
          setLoading(false);
          setWebReady(true);
          if (onWebLoaded) onWebLoaded();
        }}
        onError={(event) => {
          setLoading(false);
          setWebReady(false);
          setErrorMessage(
            event.nativeEvent.description ||
              'The web app could not be reached from the mobile shell.',
          );
        }}
        onNavigationStateChange={(navState) => {
          setCanGoBack(navState.canGoBack);
        }}
        onShouldStartLoadWithRequest={(request) => {
          const nextUrl = request.url || '';

          if (
            nextUrl.includes('whatsapp://') ||
            nextUrl.includes('api.whatsapp.com') ||
            nextUrl.includes('wa.me') ||
            nextUrl.includes('intent://')
          ) {
            openExternalLink(nextUrl);
            return false;
          }

          if (
            nextUrl.startsWith('http://') ||
            nextUrl.startsWith('https://') ||
            nextUrl === 'about:blank'
          ) {
            return true;
          }

          openExternalLink(nextUrl);
          return false;
        }}
      />
      {loading && (
        <View style={styles.topLoadingBar}>
          <ActivityIndicator size="small" color="#FFB800" style={{ marginRight: 8 }} />
          <Text style={styles.topLoadingText}>Loading JCB Exchange...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    backgroundColor: '#EFF6FF',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    color: '#0F172A',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    textAlign: 'center',
  },
  supportBox: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  supportItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  supportItemLast: {
    paddingVertical: 12,
  },
  supportLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  supportLink: {
    fontSize: 15,
    color: '#D97706',
    fontWeight: '600',
  },
  detail: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: {
    color: '#94A3B8',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: {
    backgroundColor: '#1A1D20',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 100,
    width: '100%',
    shadowColor: '#1A1D20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  loadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F8',
  },
  loadingText: {
    marginTop: 12,
    color: '#334155',
    fontSize: 15,
    fontWeight: '600',
  },
  topLoadingBar: {
    position: 'absolute',
    alignSelf: 'center',
    top: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(26, 29, 32, 0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  topLoadingText: {
    color: '#FFB800',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default HybridWebView;
