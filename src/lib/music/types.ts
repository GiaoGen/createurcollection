import type { Track } from "@/types/compilation";

export interface TrackSearchResult { id: string; title: string; artist: string; }
export interface TrackMetadata { id: string; title: string; artist: string; duration?: number; }
export interface PlayableSource { url: string; kind: "audio"; duration?: number; }

export interface MusicProvider {
  search(query: string): Promise<TrackSearchResult[]>;
  resolve(input: string): Promise<TrackMetadata | null>;
  getPlayableSource(track: Track): Promise<PlayableSource | null>;
}
