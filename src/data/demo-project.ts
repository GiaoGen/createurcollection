import { CompilationProject, blankArtwork } from "@/types/compilation";
import { createId } from "@/lib/storage";

const TITLES = ["LATE NIGHT DRIVE", "SUMMER ROOFTOP", "COLD CHROME", "LOW FIDELITY", "CITY LIGHTS", "MIDNIGHT RADIO"];

// 音频不在此同步合成（OfflineAudioContext 是异步的）：src 留空、duration 0，
// 由 DemoMusicProvider.getPlayableSource 在首次播放时合成并缓存（见 Task 4 Step 4）。
export function createDemoProject(): CompilationProject {
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
      id: createId("trk"), title, artist: "DEMO SELECTION", duration: 0, src: "",
    })),
    activeTrackId: null,
  };
}
