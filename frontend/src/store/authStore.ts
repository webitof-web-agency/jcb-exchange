import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email?: string | null;
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
  hasHydrated: boolean;
  hydrateAuth: () => void;
  setAuth: (token: string, user: AuthUser) => void;
  setAuthModalOpen: (isOpen: boolean) => void;
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
  hasHydrated: false,
  hydrateAuth: () => {
    const token = getLocalStorage('frontend_portal_token');
    const localStorageUser = getLocalStorage('frontend_portal_user');
    const user = localStorageUser ? JSON.parse(localStorageUser) : null;

    set({
      token,
      user,
      isAuthenticated: !!token && !!user,
      hasHydrated: true,
    });
  },
  setAuth: (token, user) => {
    localStorage.setItem('frontend_portal_token', token);
    localStorage.setItem('frontend_portal_user', JSON.stringify(user));
    set({
      token,
      user,
      isAuthenticated: true,
      hasHydrated: true,
      isAuthModalOpen: false,
    });
  },
  setAuthModalOpen: (isOpen) => set({ isAuthModalOpen: isOpen }),
  logout: () => {
    localStorage.removeItem('frontend_portal_token');
    localStorage.removeItem('frontend_portal_user');
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: true,
      isAuthModalOpen: false,
    });
  },
}));
