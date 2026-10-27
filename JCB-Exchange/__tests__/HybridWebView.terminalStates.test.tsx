import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import HybridWebView from '../src/screens/HybridWebView';
import { WEBVIEW_LOADING_TIMEOUT_MS } from '../src/lib/webViewLoading';

let mockWebViewProps: Record<string, any> | null = null;

jest.mock('react-native-webview', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  const MockWebView = ReactMock.forwardRef((props: Record<string, any>, ref: any) => {
    mockWebViewProps = props;
    return ReactMock.createElement(View, { ...props, ref });
  });

  return {
    __esModule: true,
    WebView: MockWebView,
  };
});

jest.mock('@react-native-firebase/messaging', () => {
  const messaging = jest.fn(() => ({
    registerDeviceForRemoteMessages: jest.fn(async () => undefined),
    getToken: jest.fn(async () => ''),
    requestPermission: jest.fn(async () => undefined),
    onTokenRefresh: jest.fn(() => jest.fn()),
    onNotificationOpenedApp: jest.fn(() => jest.fn()),
    onMessage: jest.fn(() => jest.fn()),
    getInitialNotification: jest.fn(async () => null),
  }));

  return {
    __esModule: true,
    default: messaging,
  };
});

jest.mock('../src/config/appConfig', () => ({
  getApiBaseUrl: () => 'https://api.example.com',
  getBusinessEmail: () => '',
  getSupportEmail: () => '',
  getSupportMailtoUrl: (email: string) => `mailto:${email}`,
  getWebAppUrl: () => 'https://jcbexchange.com',
  getWhatsappSupportNumber: () => '',
  getWhatsappSupportUrl: () => '',
}));

describe('HybridWebView terminal states', () => {
  beforeEach(() => {
    mockWebViewProps = null;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('notifies the parent when the initial web view load fails', async () => {
    const onWebSettled = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<HybridWebView onWebSettled={onWebSettled} />);
    });

    await ReactTestRenderer.act(async () => {
      mockWebViewProps?.onError({
        nativeEvent: { description: 'Network request failed' },
      });
    });

    expect(onWebSettled).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  test('notifies the parent when the initial web view load times out', async () => {
    const onWebSettled = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<HybridWebView onWebSettled={onWebSettled} />);
    });

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(WEBVIEW_LOADING_TIMEOUT_MS);
    });

    expect(onWebSettled).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });

  test('notifies the parent only once for a completed navigation', async () => {
    const onWebSettled = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<HybridWebView onWebSettled={onWebSettled} />);
    });

    await ReactTestRenderer.act(async () => {
      mockWebViewProps?.onLoad();
      mockWebViewProps?.onLoadEnd();
    });

    expect(onWebSettled).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
    });
  });
});
