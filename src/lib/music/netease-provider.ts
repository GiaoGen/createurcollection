import type { MusicProvider, PlayableSource, TrackMetadata, TrackSearchResult } from "./types";
import type { Track } from "@/types/compilation";

// 真实实现见 Task 16（后端代理+登录）、17（我喜欢/搜索+Provider）、18（受限状态）。
// 壳：接口齐全、方法返回空/受限，保证编译与离线回退可运行。
export class NeteaseProvider implements MusicProvider {
  async search(_q: string): Promise<TrackSearchResult[]> { return []; }
  async resolve(_i: string): Promise<TrackMetadata | null> { return null; }
  async getPlayableSource(_t: Track): Promise<PlayableSource | null> { return null; }
}
