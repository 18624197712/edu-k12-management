import { create } from 'zustand';

type UiState = { collapsed: boolean; toggleCollapsed: () => void; setCollapsed: (value: boolean) => void };
export const useUiStore = create<UiState>((set) => ({ collapsed: false, toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })), setCollapsed: (collapsed) => set({ collapsed }) }));
