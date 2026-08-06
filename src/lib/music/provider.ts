import type { MusicProvider } from "./types";
import { demoMusicProvider } from "./demo-provider";
import { neteaseProvider } from "./netease-provider";

/**
 * 默认分发器：按 track.provider 路由——netease → NeteaseProvider，其余 → DemoMusicProvider。
 * 之前 singleton 恒为 demoMusicProvider 且 setMusicProvider 从未被调用，netease 曲目永远播不出来。
 * 无 import 环：netease-provider 不反向 import 本文件。
 */
const dispatcher: MusicProvider = {
  search: (q) => demoMusicProvider.search(q),
  resolve: (i) => demoMusicProvider.resolve(i),
  getPlayableSource: (track) =>
    track.provider === "netease"
      ? neteaseProvider.getPlayableSource(track)
      : demoMusicProvider.getPlayableSource(track),
};

let singleton: MusicProvider = dispatcher;
export function getMusicProvider(): MusicProvider { return singleton; }
export function setMusicProvider(p: MusicProvider) { singleton = p; } // 未来切换正式源
