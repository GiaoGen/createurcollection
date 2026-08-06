"use client";
import { create } from "zustand";
import { loadSession, logout as authLogout } from "@/lib/netease/auth";

export type NeteaseUiStatus = "anonymous" | "pending" | "logged-in" | "expired";

/** localStorage 偏好键：仅「记住登录」勾选的布尔偏好（不含 cookie，允许）。 */
const REMEMBER_KEY = "cyc:netease-remember";

function readRememberPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}
function writeRememberPref(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (v) localStorage.setItem(REMEMBER_KEY, "1");
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // 偏好写入失败不影响登录（cookie 走 auth 层，与此无关）。
  }
}

interface NeteaseStore {
  status: NeteaseUiStatus;
  nickname: string | null;
  avatarUrl: string | null;
  userId: number | null;
  remember: boolean;
  pickerOpen: boolean;
  setPickerOpen(open: boolean): void;
  /** 应用启动/挂载时 await loadSession() → 同步 status。cookie 仅由 auth 层管理。 */
  init(): Promise<void>;
  /** 扫码轮询中。 */
  setPending(): void;
  /** 登录成功：saveSession 之后调用，写 UI 订阅态。 */
  applySession(s: { nickname: string; avatarUrl?: string; userId: number; remember: boolean }): void;
  /** verifyLogin 失败 / Cookie 失效 → expired。绝不删除已导入歌曲（project 与登录态隔离）。 */
  markExpired(): void;
  setRemember(v: boolean): void;
  logout(): Promise<void>;
}

export const useNeteaseStore = create<NeteaseStore>()((set) => ({
  status: "anonymous",
  nickname: null,
  avatarUrl: null,
  userId: null,
  remember: readRememberPref(),
  pickerOpen: false,

  setPickerOpen: (open) => set({ pickerOpen: open }),

  init: async () => {
    try {
      const session = await loadSession();
      if (session?.cookie) {
        set({
          status: "logged-in",
          nickname: session.profile?.nickname ?? null,
          avatarUrl: session.profile?.avatarUrl ?? null,
          userId: session.profile?.userId ?? null,
          remember: session.remember || readRememberPref(),
        });
        return;
      }
    } catch {
      // loadSession 失败视为匿名，不影响应用。
    }
    set({ status: "anonymous", nickname: null, avatarUrl: null, userId: null });
  },

  setPending: () => set({ status: "pending" }),

  applySession: (s) =>
    set({
      status: "logged-in",
      nickname: s.nickname,
      avatarUrl: s.avatarUrl ?? null,
      userId: s.userId,
      remember: s.remember,
    }),

  markExpired: () => set({ status: "expired" }),

  setRemember: (v) => {
    writeRememberPref(v);
    set({ remember: v });
  },

  logout: async () => {
    await authLogout();
    set({ status: "anonymous", nickname: null, avatarUrl: null, userId: null, remember: readRememberPref() });
  },
}));
