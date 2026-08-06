"use client";
import { useEffect } from "react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { getMusicProvider } from "@/lib/music/provider";

/**
 * 模块级单例 <audio> 引擎。
 * AppShell 同时挂载桌面与移动两个 <Player>（CSS 断点切换可见性），若各持一个
 * <audio> 会互相抢占播放；这里把引擎收敛为单例，两个实例共享同一音频源。
 * 不做任何自动播放：仅用户点击（Play）触发；曲目行点击只选中，不播放。
 */
let audio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "none";
    // 事件只在单例创建时挂一次；写入 store 用 getState 取稳定 action，避免闭包过期。
    audio.addEventListener("timeupdate", () => {
      useCompilationStore.getState().setProgress({ currentTime: audio!.currentTime });
    });
    audio.addEventListener("play", () => useCompilationStore.getState().setIsPlaying(true));
    audio.addEventListener("pause", () => useCompilationStore.getState().setIsPlaying(false));
    audio.addEventListener("ended", () => next());
  }
  return audio;
}

async function play(id: string): Promise<void> {
  const { project, setActiveTrack, setIsPlaying, setProgress } = useCompilationStore.getState();
  const track = project.tracks.find((t) => t.id === id);
  if (!track) return;
  const source = await getMusicProvider().getPlayableSource(track); // 走 Provider，demo 首次合成并缓存
  if (!source) {
    setIsPlaying(false); // 无源不播，不做假播放
    return;
  }
  const a = getAudio();
  if (a.src !== source.url) {
    a.src = source.url;
    a.load();
  }
  setActiveTrack(track.id);
  setProgress({ duration: source.duration ?? track.duration });
  try {
    await a.play();
  } catch {
    setIsPlaying(false);
    return;
  }
  setIsPlaying(true); // play 事件也会置 true，幂等
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

export function usePlayerEngine() {
  const activeTrackId = useCompilationStore((s) => s.project.activeTrackId);
  const activeTrack = useCompilationStore((s) =>
    s.project.tracks.find((t) => t.id === s.project.activeTrackId) ?? null
  );

  // 删除正在播放的曲目 → activeTrackId 被 store 置 null → 暂停引擎，避免“无曲目仍发声”。
  useEffect(() => {
    if (!activeTrackId) getAudio().pause();
  }, [activeTrackId]);

  return { play, toggle, next, prev, seek, activeTrack };
}
