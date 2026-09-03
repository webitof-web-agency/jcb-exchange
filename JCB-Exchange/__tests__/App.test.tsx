/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-webview', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  const MockWebView = ReactMock.forwardRef((props: any, ref: any) =>
    ReactMock.createElement(View, { ...props, ref }),
  );

  return {
    __esModule: true,
    WebView: MockWebView,
  };
});

jest.mock('@react-native-firebase/messaging', () => {
  const handlers: Array<(token: string) => void> = [];

  const messaging = () => ({
    registerDeviceForRemoteMessages: jest.fn(async () => undefined),
    getToken: jest.fn(async () => 'test-fcm-token'),
    onTokenRefresh: (handler: (token: string) => void) => {
      handlers.push(handler);
      return jest.fn(() => undefined);
    },
    setBackgroundMessageHandler: jest.fn(() => undefined),
    __handlers: handlers,
  });

  return {
    __esModule: true,
    default: messaging,
  };
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
