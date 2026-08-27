import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status?: string;
  permissions?: string[];
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
  createdAt?: string;
  updatedAt?: string;
  title?: string | null;
  isRootAdmin?: boolean;
  customRoleId?: string | null;
  customRoleName?: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  hydrateAuth: () => void;
  setAuth: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  logout: () => void;
}

// Helper to safely get from localStorage
const getLocalStorage = (key: string) => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
};

export const useAuthStore = create<AuthState>((set) => {
  return {
    token: null,
    user: null,
    isAuthenticated: false,
    hasHydrated: false,
    hydrateAuth: () => {
      const token = getLocalStorage('portal_token');
      const localStorageUser = getLocalStorage('portal_user');
      const user = localStorageUser ? JSON.parse(localStorageUser) : null;

      let isTokenValid = false;
      if (token) {
        try {
          // Decode JWT payload (base64url to JSON)
          const payloadBase64 = token.split('.')[1];
          if (payloadBase64) {
            const payload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
            // Check if expiration is greater than current time
            if (payload.exp && payload.exp * 1000 > Date.now()) {
              isTokenValid = true;
            }
          }
        } catch {
          console.warn('Invalid token in local storage');
        }
      }

      if (isTokenValid && user) {
        set({ token, user, isAuthenticated: true, hasHydrated: true });
      } else {
        if (token && typeof window !== 'undefined') {
          localStorage.removeItem('portal_token');
          localStorage.removeItem('portal_user');
        }
        set({ token: null, user: null, isAuthenticated: false, hasHydrated: true });
      }
    },
    setAuth: (token, user) => {
      localStorage.setItem('portal_token', token);
      localStorage.setItem('portal_user', JSON.stringify(user));
      set({ token, user, isAuthenticated: true, hasHydrated: true });
    },
    updateUser: (user) => {
      const currentToken = getLocalStorage('portal_token');
      if (currentToken) {
        localStorage.setItem('portal_user', JSON.stringify(user));
        set({ token: currentToken, user, isAuthenticated: true, hasHydrated: true });
      }
    },
    logout: () => {
      localStorage.removeItem('portal_token');
      localStorage.removeItem('portal_user');
      set({ token: null, user: null, isAuthenticated: false, hasHydrated: true });
    },
  };
});
