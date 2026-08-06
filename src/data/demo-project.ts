import { CompilationProject, blankArtwork } from "@/types/compilation";
import { createId } from "@/lib/storage";

const TITLES = ["LATE NIGHT DRIVE", "SUMMER ROOFTOP", "COLD CHROME", "LOW FIDELITY", "CITY LIGHTS", "MIDNIGHT RADIO"];

// 音频不在此同步合成（OfflineAudioContext 是异步的）：CompilationTrack 不存音频字段，
// 由 DemoMusicProvider.getPlayableSource 在首次播放时合成并缓存（见 lib/music/demo-provider.ts）。
export function createDemoProject(): CompilationProject {
  const now = Date.now();
  return {
    id: createId("proj"),
    title: "LATE NIGHT COLLECTION",
    subtitle: "VOL. 01",
    curator: "SUN",
    year: "2026",
    description: "A mixtape for the small hours — analogue warmth, cold edges.",
    spineStyle: "catalog",
    theme: "dark",
    frontCover: blankArtwork(),
    backCover: blankArtwork(),
    discArtwork: blankArtwork(),
    tracks: TITLES.map((title) => ({
      id: createId("trk"),
      provider: "demo",
      providerTrackId: null,
      title,
      artist: "DEMO SELECTION",
    })),
    activeTrackId: null,
    createdAt: now,
    updatedAt: now,
  };
}
