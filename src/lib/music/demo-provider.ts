import type { MusicProvider, PlayableSource, TrackMetadata, TrackSearchResult } from "./types";
import type { CompilationTrack } from "@/types/compilation";
import { synthesizeDemoWav } from "./synthesize";

class DemoMusicProvider implements MusicProvider {
  private cache = new Map<string, { src: string; duration: number }>();

  async search(_query: string): Promise<TrackSearchResult[]> { return []; }
  async resolve(_input: string): Promise<TrackMetadata | null> { return null; }

  async getPlayableSource(track: CompilationTrack): Promise<PlayableSource | null> {
    if (!this.cache.has(track.id)) {
      const seed = (track.title.length + track.id.length) % 13;
      this.cache.set(track.id, await synthesizeDemoWav(seed));
    }
    const hit = this.cache.get(track.id)!;
    return { url: hit.src, kind: "audio", duration: hit.duration };
  }
}

export const demoMusicProvider = new DemoMusicProvider();
