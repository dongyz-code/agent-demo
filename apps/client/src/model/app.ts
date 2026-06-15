import { create } from 'zustand';

type AppState = {
  navCollapsed: boolean;
  toggleNav: () => void;
  setNavCollapsed: (value: boolean) => void;
};

export const useAppModel = create<AppState>((set) => ({
  navCollapsed: false,
  toggleNav: () =>
    set((state) => ({
      navCollapsed: !state.navCollapsed,
    })),
  setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
}));
