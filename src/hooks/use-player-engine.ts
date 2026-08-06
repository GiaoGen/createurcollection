"use client";
import { useEffect } from "react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { getMusicProvider } from "@/lib/music/provider";
import { clearPlaybackCache } from "@/lib/netease/playback";
import type { PlaybackRefusal } from "@/lib/music/types";
import type { CompilationTrack } from "@/types/compilation";

/**
 * 模块级单例 <audio> 引擎。
 * AppShell 同时挂载桌面与移动两个 <Player>（CSS 断点切换可见性），若各持一个
 * <audio> 会互相抢占播放；这里把引擎收敛为单例，两个实例共享同一音频源。
 * 不做任何自动播放：仅用户点击（Play）触发；曲目行点击只选中，不播放。
 */
let audio: HTMLAudioElement | null = null;
// 播放调用单调递增 token：快速连点 next/toggle 时，旧 play 的 await 结束晚于新 play，
// 其 post-await 写 store（成功置 true / 失败置 false）会覆盖新状态，造成 UI 与实际播放不一致。
let playToken = 0;
// 音频 error 的一次性重试标记：网易云 URL 失效 → 重取一次；再失败 → 停止不重试。
// 每次新 play 重置，手动重播某曲后允许再次重试。
let retriedForId: string | null = null;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "none";
    audio.volume = useCompilationStore.getState().player.volume; // 创建时接线音量（无音量 UI，仅引擎）
    // 事件只在单例创建时挂一次；写入 store 用 getState 取稳定 action，避免闭包过期。
    audio.addEventListener("timeupdate", () => {
      useCompilationStore.getState().setProgress({ currentTime: audio!.currentTime });
    });
    audio.addEventListener("play", () => useCompilationStore.getState().setIsPlaying(true));
    audio.addEventListener("pause", () => useCompilationStore.getState().setIsPlaying(false));
    audio.addEventListener("ended", () => next());
    // 网络/解码期间的等待态 → loading；canplay/playing → 恢复。
    audio.addEventListener("loadstart", () => useCompilationStore.getState().setProgress({ loading: true }));
    audio.addEventListener("waiting", () => useCompilationStore.getState().setProgress({ loading: true }));
    audio.addEventListener("stalled", () => useCompilationStore.getState().setProgress({ loading: true }));
    audio.addEventListener("canplay", () => useCompilationStore.getState().setProgress({ loading: false }));
    audio.addEventListener("playing", () => useCompilationStore.getState().setProgress({ loading: false }));
    // 播放错误：网易云 URL 过期/404 → 清缓存重取一次；仍失败 → 停止 + 提示，不无限重试。
    // demo 合成音频 / stopPlayback 清源等非真实播放错误直接忽略。
    audio.addEventListener("error", () => {
      const a = audio;
      if (!a || !a.src) return; // stopPlayback 已 removeAttribute("src")，非真实播放错误
      const { project } = useCompilationStore.getState();
      const track = project.tracks.find((t) => t.id === project.activeTrackId);
      if (!track || track.provider !== "netease" || !track.providerTrackId) return; // demo/非网易云忽略
      if (retriedForId === track.id) {
        // 已重试过 → 停止 + 提示，不再重试
        useCompilationStore.getState().setProgress({ loading: false, error: "播放失败（已重试）" });
        return;
      }
      retriedForId = track.id;
      useCompilationStore.getState().setProgress({ loading: true });
      clearPlaybackCache(track.providerTrackId);
      getMusicProvider()
        .getPlayableSource(track)
        .then((source) => {
          const s = useCompilationStore.getState();
          if (s.project.activeTrackId !== track.id) return; // 用户已切走
          if (source && source.kind === "audio") {
            const el = getAudio();
            el.src = source.url;
            el.load();
            s.setProgress({
              loading: false,
              duration: source.duration ?? (track.durationMs ?? 0) / 1000,
              error: null,
            });
            // 重试 URL 仍不可播时 play() 会 reject（NotSupportedError）；不 catch 会产生
            // unhandled promise rejection → Console Error。真实失败已由 audio error 事件
            // 走「播放失败（已重试）」分支，这里仅吞掉 reject，不重复写错误。
            void el.play().catch(() => {});
          } else {
            s.setProgress({ loading: false, error: "播放失败（已重试）" });
          }
        })
        .catch(() => useCompilationStore.getState().setProgress({ loading: false, error: "播放失败（已重试）" }));
    });
  }
  return audio;
}

/** 受限/未登录/不可播：统一处理并分流（自动切歌仅 restricted/unavailable）。 */
function handleRefusal(track: CompilationTrack, refusal: PlaybackRefusal): void {
  const { setActiveTrack, setProgress, setDenied } = useCompilationStore.getState();
  getAudio().pause(); // 停掉可能仍在播的上一首，避免「无曲目仍发声」
  setActiveTrack(track.id); // 先置 activeTrack，next() 才能解析索引
  if (refusal.kind === "auth-required") {
    setProgress({ loading: false, error: refusal.reason }); // 未登录 → 提示，不自动切歌
    return;
  }
  if (refusal.kind === "restricted") {
    setDenied(track.id, "restricted");
    setProgress({ loading: false, error: "受限 · " + refusal.reason });
    next(); // 自动切下一首
    return;
  }
  // unavailable
  setDenied(track.id, "unavailable");
  setProgress({ loading: false, error: refusal.reason });
  next(); // 自动切下一首
}

async function play(id: string): Promise<void> {
  const token = ++playToken;
  const { project, setActiveTrack, setIsPlaying, setProgress, setDenied, offline } = useCompilationStore.getState();
  const track = project.tracks.find((t) => t.id === id);
  if (!track) return;
  retriedForId = null; // 每次新 play 重置重试标记
  setProgress({ loading: true, error: null });
  // 离线短路：网易云曲目断网不可播（demo 本地合成不受影响）；不自动切歌。
  if (offline && track.provider === "netease") {
    getAudio().pause();
    setActiveTrack(track.id);
    setProgress({ loading: false, error: "离线，暂时无法播放网易云歌曲" });
    return;
  }
  const source = await getMusicProvider().getPlayableSource(track); // 走 Provider，demo 首次合成并缓存
  // 竞态守卫：await 期间 stopPlayback/新 play 已使 playToken 递增 → 本次 play 作废。
  // 必须在此拦截，否则 post-await 仍会重设 src 并播放旧音频、把旧 track id 写回 store（跨项目数据污染）。
  if (token !== playToken) return;
  if (!source) {
    // 无源不播，不做假播放（顶部 token 守卫已排除被更新的 play 取代的情况）
    getAudio().pause();
    setActiveTrack(track.id);
    setProgress({ loading: false, error: "不可播放" });
    return;
  }
  if (source.kind !== "audio") {
    handleRefusal(track, source); // 受限/未登录/不可播（见上）
    return;
  }
  setDenied(track.id, null); // 成功取得源 → 清受限标记
  const a = getAudio();
  if (a.src !== source.url) {
    a.src = source.url;
    a.load();
  }
  setActiveTrack(track.id);
  // durationMs 为毫秒（CompilationTrack），源/引擎使用秒。
  setProgress({ duration: source.duration ?? (track.durationMs ?? 0) / 1000, loading: false, error: null });
  try {
    await a.play();
  } catch {
    // 只有仍是最近一次播放才写 isPlaying，避免被换源 load() 中止的旧 play 覆盖新播放状态
    if (token === playToken) setProgress({ loading: false, error: "播放失败" });
    return;
  }
  if (token === playToken) setIsPlaying(true); // play 事件也会置 true，幂等
}

function toggle(): void {
  const { player, project } = useCompilationStore.getState();
  const a = getAudio();
  if (player.isPlaying) {
    a.pause();
    useCompilationStore.getState().setIsPlaying(false);
  } else if (project.activeTrackId) {
    play(project.activeTrackId);
  } else {
    const first = project.tracks[0];
    if (first) play(first.id);
  }
}

function next(): void {
  const { project } = useCompilationStore.getState();
  const tracks = project.tracks;
  if (tracks.length === 0) return;
  const idx = project.activeTrackId ? tracks.findIndex((t) => t.id === project.activeTrackId) : -1;
  if (idx === -1 || idx === tracks.length - 1) {
    // 末尾：停止（pause 事件会置 isPlaying=false），activeTrack 保持最后一首。
    getAudio().pause();
    useCompilationStore.getState().setIsPlaying(false);
    return;
  }
  play(tracks[idx + 1].id);
}

function prev(): void {
  const { project, player } = useCompilationStore.getState();
  const tracks = project.tracks;
  if (tracks.length === 0) return;
  const idx = project.activeTrackId ? tracks.findIndex((t) => t.id === project.activeTrackId) : -1;
  if (idx === -1) return;
  if (player.currentTime > 3) {
    seek(0); // 已播超 3s：归零重播，继续播放
    return;
  }
  if (idx === 0) {
    seek(0);
    return;
  }
  play(tracks[idx - 1].id);
}

function seek(t: number): void {
  const a = getAudio();
  try {
    a.currentTime = t;
  } catch {
    // 无媒体源时部分浏览器设置 currentTime 抛 InvalidStateError，忽略。
  }
  useCompilationStore.getState().setProgress({ currentTime: t });
}

/**
 * 停止播放并释放音频源（切换项目时调用，防止旧项目音频继续发声/旧曲目残留 src）。
 * playToken++ 使在途 play 的 post-await 不再写 store（与 next/toggle 防竞态一致）。
 * 播放器会话态（isPlaying/currentTime/duration）由 loadProject 重置，这里只管引擎本体。
 */
export function stopPlayback(): void {
  playToken++;
  if (audio) {
    audio.pause();
    try {
      audio.removeAttribute("src");
      audio.load();
    } catch {
      // removeAttribute/load 失败（无媒体源等）：忽略，不影响切项目。
    }
  }
}

export function usePlayerEngine() {
  const activeTrackId = useCompilationStore((s) => s.project.activeTrackId);
  const activeTrack = useCompilationStore((s) =>
    s.project.tracks.find((t) => t.id === s.project.activeTrackId) ?? null
  );

  // 删除正在播放的曲目 → activeTrackId 被 store 置 null → 暂停引擎，避免“无曲目仍发声”。
  useEffect(() => {
    if (!activeTrackId) getAudio().pause();
  }, [activeTrackId]);

  // 音量接线：PlayerState.volume 变化 → 同步单例 audio 音量（无音量 UI，仅引擎订阅）。
  useEffect(() => {
    return useCompilationStore.subscribe(
      (s) => s.player.volume,
      (v) => {
        getAudio().volume = v;
      }
    );
  }, []);

  return { play, toggle, next, prev, seek, activeTrack };
}
