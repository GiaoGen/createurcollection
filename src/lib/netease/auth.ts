// 扫码登录 + Cookie 存储层（Task 18）。
//
// ⛔ 安全约束：
// - 绝不保存手机号 / 密码 / 短信验证码 / 二维码 Key / 完整 API 请求日志。
// - 绝不把 Cookie 写入 localStorage / URL / Console / 错误日志 / 导出文件。
// - Cookie 只存 sessionStorage（默认）；仅当调用方显式 remember=true 才写 IndexedDB（sessions 表）。
// - 二维码 Key 仅在内存中流转，不落任何存储。
// - 本功能基于第三方网易云 API，并非网易云官方授权登录。

import { neteaseClient } from "./client";
import { NeteaseError } from "./types";
import type {
  NeteaseLoginStatusResponse,
  NeteaseProfile,
  NeteaseQrCheckResponse,
  NeteaseQrCreateResponse,
  NeteaseQrKeyResponse,
  NeteaseUserDetailResponse,
  StoredNeteaseSession,
} from "./types";
import { clearPlaybackCache } from "./playback";
import { deleteNeteaseSession, getNeteaseSession, saveNeteaseSession } from "@/store/db";

const SESSION_COOKIE_KEY = "cyc-netease-cookie";
const POLL_INTERVAL_MS = 2_000;

/** 内存登录态（登出/刷新后由 loadSession 重建）。Cookie 仅内存持有，不落 Console/日志。 */
let memorySession: { cookie: string; profile?: StoredNeteaseSession } | null = null;

export type LoginStatus = "anonymous" | "pending" | "logged-in" | "expired";
export type QrCheckState = "waiting" | "scanned" | "expired" | "confirmed";
export interface QrCheckResult {
  state: QrCheckState;
  cookie?: string;
}

/** SSR 安全：服务端返回 null，浏览器返回 sessionStorage。 */
function getSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

// ---------------------------------------------------------------------------
// 扫码登录（二维码 Key 全程仅内存持有）
// ---------------------------------------------------------------------------

/** GET /login/qr/key → data.unikey。 */
export async function getQrKey(): Promise<string> {
  const body = await neteaseClient.request<NeteaseQrKeyResponse>("/login/qr/key", {
    params: { timestamp: Date.now() },
  });
  const key = body.data?.unikey ?? body.unikey;
  if (!key) throw new NeteaseError("api", "未获取到二维码 Key");
  return key;
}

/** GET /login/qr/create → 优先返回 API 的 Base64 二维码图（T19 展示），无图时返回 qrurl 供前端生成。 */
export async function createQr(key: string): Promise<{ qrimg?: string; qrurl: string }> {
  const body = await neteaseClient.request<NeteaseQrCreateResponse>("/login/qr/create", {
    params: { key, qrimg: true, timestamp: Date.now() },
  });
  const qrimg = body.data?.qrimg ?? body.qrimg;
  const qrurl = body.data?.qrurl ?? body.qrurl;
  if (!qrurl) throw new NeteaseError("api", "未获取到二维码内容");
  return { qrimg, qrurl };
}

/** 单次查询二维码状态（不轮询）。 */
async function checkQrStatus(key: string, signal?: AbortSignal): Promise<QrCheckResult> {
  const body = await neteaseClient.request<NeteaseQrCheckResponse>("/login/qr/check", {
    params: { key, timestamp: Date.now(), noCookie: true },
    skipCodeCheck: true,
    signal,
  });
  const code = body.code ?? body.data?.code;
  if (code === 800) return { state: "expired" };
  if (code === 802) return { state: "scanned" };
  if (code === 803) {
    const cookie = typeof body.cookie === "string" && body.cookie ? body.cookie : body.data?.cookie;
    return { state: "confirmed", cookie };
  }
  return { state: "waiting" };
}

/**
 * 轮询登录状态：约每 2s 查询一次（每次新 timestamp），直到过期/成功或 signal 取消。
 * 中途 waiting/scanned 经 onUpdate 上抛（T19 用于 UI 提示）；终端状态作为返回值。
 */
export async function pollQrCheck(
  key: string,
  signal?: AbortSignal,
  onUpdate?: (state: QrCheckResult) => void,
): Promise<QrCheckResult> {
  for (;;) {
    if (signal?.aborted) throw new NeteaseError("network", "登录已取消");
    let result: QrCheckResult;
    try {
      result = await checkQrStatus(key, signal);
    } catch (err) {
      if (signal?.aborted) throw new NeteaseError("network", "登录已取消");
      throw err;
    }
    if (result.state === "expired" || result.state === "confirmed") {
      return result;
    }
    onUpdate?.(result);
    await delay(POLL_INTERVAL_MS, signal);
  }
}

/** GET /login/status（显式带 cookie）；失败再试 /user/detail 兜底；都失败 → { ok:false }。 */
export async function verifyLogin(
  cookie: string,
): Promise<{ ok: boolean; profile?: NeteaseProfile }> {
  if (!cookie) return { ok: false };
  try {
    const body = await neteaseClient.request<NeteaseLoginStatusResponse>("/login/status", {
      params: { timestamp: Date.now() },
      cookie,
    });
    const profile = body.data?.profile ?? body.profile;
    if (body.code === 200 && profile?.userId) {
      return { ok: true, profile };
    }
  } catch {
    // 落入兜底
  }
  try {
    const body = await neteaseClient.request<NeteaseUserDetailResponse>("/user/detail", {
      params: { timestamp: Date.now() },
      cookie,
    });
    if (body.code === 200 && body.profile?.userId) {
      return { ok: true, profile: body.profile };
    }
  } catch {
    // 忽略
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Cookie 存储层
// ---------------------------------------------------------------------------

/**
 * 保存登录会话。
 * - sessionStorage 总是写入（当前标签页会话）。
 * - 仅 remember=true 才写 IndexedDB（StoredNeteaseSession）。
 * - 任何情况都不写 localStorage。
 */
export async function saveSession(
  profile: NeteaseProfile,
  cookie: string,
  remember: boolean,
): Promise<void> {
  if (!cookie) return;
  const session: StoredNeteaseSession = {
    cookie,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl,
    userId: profile.userId,
    loggedInAt: Date.now(),
  };
  memorySession = { cookie, profile: session };
  try {
    getSessionStorage()?.setItem(SESSION_COOKIE_KEY, cookie);
  } catch {
    // 隐私模式等写入失败，忽略；仍保有内存态。
  }
  if (remember) {
    await saveNeteaseSession(session);
  }
}

/** 读取会话：先 sessionStorage，后 IndexedDB 回退。 */
export async function loadSession(): Promise<{
  cookie: string;
  remember: boolean;
  profile?: StoredNeteaseSession;
} | null> {
  const ssCookie = getSessionStorage()?.getItem(SESSION_COOKIE_KEY);
  if (ssCookie) {
    memorySession = { cookie: ssCookie };
    return { cookie: ssCookie, remember: false };
  }
  const stored = await getNeteaseSession();
  if (stored?.cookie) {
    memorySession = { cookie: stored.cookie, profile: stored };
    return { cookie: stored.cookie, remember: true, profile: stored };
  }
  memorySession = null;
  return null;
}

/** 清空：sessionStorage + IndexedDB session + 内存态 + 全部 TTL 缓存（含私人歌单） + 播放地址缓存。 */
export async function clearSession(): Promise<void> {
  try {
    getSessionStorage()?.removeItem(SESSION_COOKIE_KEY);
  } catch {
    // 忽略
  }
  await deleteNeteaseSession();
  memorySession = null;
  neteaseClient.clearCache();
  clearPlaybackCache();
}

/** 登出：先清本地，再尽力而为通知第三方 /logout（失败忽略）。 */
export async function logout(): Promise<void> {
  const cookie =
    memorySession?.cookie ?? getSessionStorage()?.getItem(SESSION_COOKIE_KEY) ?? undefined;
  await clearSession();
  if (!cookie) return;
  try {
    await neteaseClient.request("/logout", {
      params: { timestamp: Date.now() },
      cookie,
    });
  } catch {
    // 第三方 /logout 尽力而为，失败不影响本地登出。
  }
}

export function isLoggedIn(): boolean {
  return !!memorySession?.cookie;
}

/**
 * 供 T19/T20 判断登录态。
 * 注意：应用启动时应先 await 一次 loadSession()（重建内存态，含 IndexedDB 记住登录回退），
 * 再调用本函数才是准确的。expired 语义由上层在 verifyLogin 失败后清会话并提示重新登录。
 */
export function getLoginStatus(): LoginStatus {
  return memorySession?.cookie ? "logged-in" : "anonymous";
}
