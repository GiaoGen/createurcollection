// 统一网易云客户端（Task 18）：Base URL 读取、统一 fetch、超时/CORS/网络/HTTP 错误归一、
// Cookie 显式传递、TTL 缓存。所有网易云请求必须经此（禁止在组件中直接拼接 API 地址）。

import { NeteaseError, type NeteaseApiResponse } from "./types";

const BASE = (process.env.NEXT_PUBLIC_NETEASE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** 请求超时（毫秒）。fetch 外层 AbortController 兜底。 */
const REQUEST_TIMEOUT_MS = 8_000;

/** 端点类别 TTL（毫秒）。search 30min / 歌单 6h / 歌曲元数据 24h；登录态与二维码一律不缓存。
 *  播放地址（/song/url*）缓存归 playback.ts（内存短缓存），这里 TTL=0。 */
function cacheTtlFor(path: string): number {
  if (path.startsWith("/login/")) return 0; // 二维码状态 / 登录校验不缓存
  if (path.startsWith("/search")) return 30 * 60_000;
  if (
    path.startsWith("/user/playlist") ||
    path.startsWith("/likelist") ||
    path.startsWith("/playlist/detail")
  ) {
    return 6 * 60 * 60_000;
  }
  if (path.startsWith("/song/detail")) return 24 * 60 * 60_000;
  return 0;
}

/** Base URL 未配置时网易云功能整体关闭，应用以 Demo 音乐完整回退（不报错）。 */
export function isNeteaseAvailable(): boolean {
  return BASE.length > 0;
}

export interface NeteaseRequestOptions {
  params?: Record<string, string | number | boolean>;
  /** 登录态 Cookie：GET 进 query、POST 进 JSON Body。绝不写入 localStorage / URL hash / Console / 日志。 */
  cookie?: string;
  method?: "GET" | "POST";
  /** 外部取消（扫码轮询组件卸载等）。 */
  signal?: AbortSignal;
  /** 跳过 code!==200 的 API 错误抛错（扫码轮询 800/801/802/803 是合法状态，需原样返回）。 */
  skipCodeCheck?: boolean;
}

/**
 * 网易云 API 客户端。Cookie 处理逻辑集中于此，组件不自处理。
 * TTL 缓存 key = `${method}:${path}?${params}`（不含 cookie——cookie 不进缓存 key）。
 */
export class NeteaseClient {
  readonly available: boolean;
  private cache = new Map<string, { expiresAt: number; value: unknown }>();

  constructor() {
    this.available = isNeteaseAvailable();
  }

  async request<T>(path: string, opts: NeteaseRequestOptions = {}): Promise<T> {
    if (!this.available) {
      throw new NeteaseError("network", "网易云 API 未配置（NEXT_PUBLIC_NETEASE_API_BASE_URL 为空）");
    }
    const { params, cookie, method = "GET", signal, skipCodeCheck = false } = opts;
    if (signal?.aborted) throw new NeteaseError("network", "请求已取消");

    const query = this.buildQuery(params);
    const cacheKey = `${method}:${path}?${query}`;
    const ttl = cacheTtlFor(path);

    if (ttl > 0) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return hit.value as T;
      }
    }

    const url = this.buildUrl(path, query, method, cookie);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          signal: controller.signal,
          headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
          body: method === "POST" ? JSON.stringify(this.postBody(cookie)) : undefined,
        });
      } catch (err) {
        throw this.normalizeError(err, signal);
      }

      if (!res.ok) {
        throw new NeteaseError("http", `HTTP ${res.status}`, { status: res.status });
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new NeteaseError("network", "响应解析失败（非 JSON）");
      }

      const body = json as NeteaseApiResponse;
      if (!skipCodeCheck && typeof body?.code === "number" && body.code !== 200) {
        throw new NeteaseError("api", body.message ?? body.msg ?? `API code ${body.code}`, {
          code: body.code,
        });
      }

      if (ttl > 0) {
        this.cache.set(cacheKey, { expiresAt: Date.now() + ttl, value: json });
      }
      return json as T;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  /** 清空全部 TTL 缓存（登出时调用，含私人歌单等登录态相关缓存）。 */
  clearCache(): void {
    this.cache.clear();
  }

  private buildQuery(params?: Record<string, string | number | boolean>): string {
    if (!params) return "";
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      qs.set(k, String(v));
    }
    return qs.toString();
  }

  /** GET 时 cookie 以 query `cookie=` 显式传递；POST 时 cookie 放 JSON Body（见 postBody）。 */
  private buildUrl(path: string, query: string, method: string, cookie?: string): string {
    const parts: string[] = [];
    if (query) parts.push(query);
    if (method === "GET" && cookie) parts.push(`cookie=${encodeURIComponent(cookie)}`);
    return `${BASE}${path}${parts.length ? `?${parts.join("&")}` : ""}`;
  }

  private postBody(cookie?: string): Record<string, string> {
    return cookie ? { cookie } : {};
  }

  private normalizeError(err: unknown, signal?: AbortSignal): NeteaseError {
    if (signal?.aborted) return new NeteaseError("network", "请求已取消");
    if (err instanceof DOMException && err.name === "AbortError") {
      return new NeteaseError("timeout", "请求超时");
    }
    if (err instanceof TypeError) {
      return new NeteaseError("network", "网络错误或 CORS 失败");
    }
    return new NeteaseError("network", err instanceof Error ? err.message : "网络错误");
  }
}

/** 全局共享实例（auth / playlist / playback / provider 共用一份 TTL 缓存）。 */
export const neteaseClient = new NeteaseClient();
