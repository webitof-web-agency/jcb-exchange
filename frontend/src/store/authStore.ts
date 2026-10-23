import { create } from 'zustand';
import { isUsableAuthToken } from '@/lib/authSession.mjs';

export interface AuthUser {
  id: string;
  email?: string | null;
  hasPassword?: boolean;
  name?: string | null;
  role?: string;
  rawRole?: string;
  status?: string | null;
  ownerName?: string | null;
  onboardingStatus?: string | null;
  accountStatus?: string | null;
  kycStatus?: string | null;
  partnerType?: string | null;
  businessAddress?: string | null;
  district?: string | null;
  pinCode?: string | null;
  contactPreference?: string | null;
  city?: string | null;
  state?: string | null;
  mobile?: string | null;
  whatsappNumber?: string | null;
  isVerifiedPartner?: boolean;
  isPrimeCustomer?: boolean;
  customerCategory?: string | null;
  primeSubscriptionExpiresAt?: string | null;
  portalHomeRoute?: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  authMode: 'login' | 'signup';
  hasHydrated: boolean;
  hydrateAuth: () => void;
  setAuth: (token: string, user: AuthUser) => void;
  setAuthModalOpen: (isOpen: boolean, mode?: 'login' | 'signup') => void;
  logout: () => void;
}

const getLocalStorage = (key: string) => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }

  return null;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isAuthModalOpen: false,
  authMode: 'login',
  hasHydrated: false,
  hydrateAuth: () => {
    const token = getLocalStorage('frontend_portal_token');
    const localStorageUser = getLocalStorage('frontend_portal_user');
    let user: AuthUser | null = null;

    try {
      user = localStorageUser ? (JSON.parse(localStorageUser) as AuthUser) : null;
    } catch {
      user = null;
    }

    if (isUsableAuthToken(token) && user) {
      set({
        token,
        user,
        isAuthenticated: true,
        hasHydrated: true,
      });
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('frontend_portal_token');
      localStorage.removeItem('frontend_portal_user');
    }

    set({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: true,
    });
  },
  setAuth: (token, user) => {
    localStorage.setItem('frontend_portal_token', token);
    localStorage.setItem('frontend_portal_user', JSON.stringify(user));
    localStorage.removeItem('frontend_portal_token:last_activity');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jcbexchange-auth-change'));
    }
    set({
      token,
      user,
      isAuthenticated: true,
      hasHydrated: true,
      isAuthModalOpen: false,
    });
  },
  setAuthModalOpen: (isOpen, mode = 'login') => set({ isAuthModalOpen: isOpen, authMode: mode }),
  logout: () => {
    localStorage.removeItem('frontend_portal_token');
    localStorage.removeItem('frontend_portal_user');
    localStorage.removeItem('frontend_portal_token:last_activity');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jcbexchange-auth-change'));
    }
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: true,
      isAuthModalOpen: false,
    });
  },
}));
