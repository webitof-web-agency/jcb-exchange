import { create } from 'zustand';
import React from 'react';

interface HeaderState {
  customHeader: React.ReactNode | null;
  setCustomHeader: (node: React.ReactNode | null) => void;
}

export const useHeaderStore = create<HeaderState>((set) => ({
  customHeader: null,
  setCustomHeader: (node) => set({ customHeader: node }),
}));
