import type { MusicProvider } from "./types";
import { demoMusicProvider } from "./demo-provider";

let singleton: MusicProvider = demoMusicProvider;
export function getMusicProvider(): MusicProvider { return singleton; }
export function setMusicProvider(p: MusicProvider) { singleton = p; } // 未来切换正式源
