import React from 'react';
import { Metadata } from 'next';
import NotificationsPageClient from './NotificationsPageClient';

export const metadata: Metadata = {
  title: 'Notifications | JCB Exchange',
  description: 'View your notifications',
};

export default function NotificationsPage() {
  return <NotificationsPageClient />;
}
