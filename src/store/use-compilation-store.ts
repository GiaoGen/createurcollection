import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CompilationProject, EditorMode, FaceTarget, ArtworkState, Track } from "@/types/compilation";
import { createDemoProject } from "@/data/demo-project";

interface PlayerState { isPlaying: boolean; currentTime: number; duration: number; }

interface CompilationStore {
  project: CompilationProject;
  mode: EditorMode;
  face: FaceTarget;
  mobileSheetOpen: boolean;
  player: PlayerState;

  setProjectField: <K extends keyof CompilationProject>(key: K, value: CompilationProject[K]) => void;
  setArtwork: (face: FaceTarget, patch: Partial<ArtworkState>) => void;
  setMode: (m: EditorMode) => void;
  setFace: (f: FaceTarget) => void;
  setMobileSheetOpen: (open: boolean) => void;
  setTheme: (t: "light" | "dark") => void;
  addTrack: (t: Track) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  reorderTracks: (from: number, to: number) => void;
  setActiveTrack: (id: string | null) => void;
  setIsPlaying: (v: boolean) => void;
  setProgress: (partial: Partial<PlayerState>) => void;
  resetProject: () => void;
}

export const useCompilationStore = create<CompilationStore>()(
  persist(
    (set, get) => ({
      project: createDemoProject(),
      mode: "info",
      face: "front",
      mobileSheetOpen: false,
      player: { isPlaying: false, currentTime: 0, duration: 0 },

      setProjectField: (key, value) =>
        set((s) => ({ project: { ...s.project, [key]: value } })),

      setArtwork: (face, patch) =>
        set((s) => {
          const key = face === "front" ? "frontCover" : face === "back" ? "backCover" : "discArtwork";
          return { project: { ...s.project, [key]: { ...s.project[key], ...patch } } };
        }),

      setMode: (mode) => set({ mode }),
      setFace: (face) => set({ face }),
      setMobileSheetOpen: (mobileSheetOpen) => set({ mobileSheetOpen }),
      setTheme: (theme) => set((s) => ({ project: { ...s.project, theme } })),

      addTrack: (t) => set((s) => ({ project: { ...s.project, tracks: [...s.project.tracks, t] } })),
      updateTrack: (id, patch) =>
        set((s) => ({
          project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) },
        })),
      removeTrack: (id) =>
        set((s) => ({
          project: {
            ...s.project,
            tracks: s.project.tracks.filter((t) => t.id !== id),
            activeTrackId: s.project.activeTrackId === id ? null : s.project.activeTrackId,
          },
        })),
      reorderTracks: (from, to) =>
        set((s) => {
          const arr = [...s.project.tracks];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return { project: { ...s.project, tracks: arr } };
        }),

      setActiveTrack: (activeTrackId) => set((s) => ({ project: { ...s.project, activeTrackId } })),
      setIsPlaying: (isPlaying) => set((s) => ({ player: { ...s.player, isPlaying } })),
      setProgress: (partial) => set((s) => ({ player: { ...s.player, ...partial } })),

      resetProject: () => set({ project: createDemoProject(), player: { isPlaying: false, currentTime: 0, duration: 0 } }),
    }),
    {
      name: "create-your-collection",
      partialize: (s) => ({ project: s.project }), // 只持久化 project；mode/player 为会话态
    }
  )
);
