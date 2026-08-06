"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight, Disc3, X } from "lucide-react";
import { useNeteaseStore } from "@/store/use-netease-store";
import { useCompilationStore } from "@/store/use-compilation-store";
import {
  getQrKey,
  createQr,
  pollQrCheck,
  verifyLogin,
  saveSession,
  loadSession,
} from "@/lib/netease/auth";
import { neteaseClient, isNeteaseAvailable } from "@/lib/netease/client";
import {
  getUserPlaylists,
  getPlaylistTracks,
  getLikedTrackIds,
  getSongsByIds,
} from "@/lib/netease/playlist";
import type { NeteasePlaylistSummary } from "@/lib/netease/playlist";
import { normalizeTrack } from "@/lib/netease/normalize";
import { NeteaseError } from "@/lib/netease/types";
import type { NeteaseSearchResponse } from "@/lib/netease/types";
import type { CompilationTrack } from "@/types/compilation";
import { formatTime } from "@/lib/storage";
import { toDataURL as qrToDataURL } from "qrcode";
import { useIsDesktop } from "@/lib/use-is-desktop";

/**
 * 网易云添加（Task 19）：扫码登录 + 我喜欢的音乐/我的歌单/搜索 + 多选添加。
 *
 * ⛔ 安全约束（与 T18 一致，UI 层同样遵守）：
 * - Cookie 只经 auth 层（saveSession/loadSession/logout）管理，本组件绝不读/写/打印 cookie；
 *   登录后经 loadSession() 把 cookie 短暂持有在组件内存 state（仅当前面板生命周期），不落任何存储。
 * - 二维码 Key 仅内存持有，轮询结束/关闭即弃。
 * - 不写 localStorage / URL / Console / 导出文件。
 * - 不声称「官方」授权；不实现会员绕过/解灰。
 * - Cookie 失效 → 提示重新登录，绝不删除已导入歌曲（project 与登录态完全隔离）。
 */

const FADE = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } as const;
const PANEL = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const;
const INSTANT = { duration: 0 } as const;

/** 固定安全提示文案（逐字保留，不可改）。 */
const SECURITY_NOTICE =
  "本功能通过第三方网易云音乐接口实现。登录凭证仅保存在当前浏览器中。请仅在你信任的 API 服务上使用扫码登录。";

type TabId = "liked" | "playlists" | "search";
const TABS: { key: TabId; label: string }[] = [
  { key: "liked", label: "我喜欢的" },
  { key: "playlists", label: "我的歌单" },
  { key: "search", label: "搜索" },
];

/**
 * 单行错误文案。仅当 API 错误确认为登录态失效（code 301 或「需要登录/登录已失效/登录状态已过期」
 * 等消息）时才走重新登录路径；其余 API 错误（404/500/限流/业务错误）与网络/超时/HTTP/CORS
 * 一律可重试，绝不误踢登录态。
 */
function isAuthExpired(err: unknown): boolean {
  return err instanceof NeteaseError && err.kind === "api" && (err.code === 301 || /需要登录|登录.{0,4}失效|登录状态已过期/.test(err.message));
}

function errorText(err: unknown): { message: string; authExpired: boolean } {
  if (err instanceof NeteaseError) {
    return { message: err.message, authExpired: isAuthExpired(err) };
  }
  return { message: err instanceof Error ? err.message : "加载失败", authExpired: false };
}

export function NeteasePicker() {
  const pickerOpen = useNeteaseStore((s) => s.pickerOpen);
  const setPickerOpen = useNeteaseStore((s) => s.setPickerOpen);
  const status = useNeteaseStore((s) => s.status);
  const userId = useNeteaseStore((s) => s.userId);
  const reduced = useReducedMotion();
  const desktop = useIsDesktop();

  const fade = reduced ? INSTANT : FADE;
  const panel = reduced ? INSTANT : PANEL;

  // 扫码轮询 AbortController（关闭/刷新即中止）。
  const abortRef = useRef<AbortController | null>(null);
  // 登录 Cookie（内存态，仅当前面板生命周期；登录成功/已登录打开时经 loadSession() 重建）。
  const [cookie, setCookie] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>("liked");
  const [selected, setSelected] = useState<Map<number, CompilationTrack>>(new Map());
  const [sourcePlaylistId, setSourcePlaylistId] = useState<number | undefined>(undefined);

  // 登录态引导：应用启动时同步一次 status（auth 层读 sessionStorage/IndexedDB 回退）。
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void useNeteaseStore.getState().init().then(() => {
      if (!cancelled) setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 重建 cookie（仅内存持有，面板生命周期内）。登录成功后 / 已登录打开时调用。
  const refreshCookie = useCallback(async () => {
    const session = await loadSession();
    setCookie(session?.cookie ?? null);
  }, []);

  // 卸载：中止仍在进行的扫码轮询（取 cleanup 时刻最新的 controller）。
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      abortRef.current?.abort();
    };
  }, []);

  // 已登录时打开面板：重建 cookie（延后启动，避免 effect 内同步 setState）。
  useEffect(() => {
    if (pickerOpen && status === "logged-in") {
      const t = setTimeout(() => void refreshCookie(), 0);
      return () => clearTimeout(t);
    }
  }, [pickerOpen, status, refreshCookie]);

  // 关闭：中止轮询 + 清选择 + 复位来源状态（重开面板从干净初始态开始）。
  const close = useCallback(() => {
    abortRef.current?.abort();
    setSelected(new Map());
    setSourcePlaylistId(undefined);
    setActiveTab("liked");
    setPickerOpen(false);
  }, [setSelected, setSourcePlaylistId, setActiveTab, setPickerOpen]);

  // Escape 关闭。
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen, close]);

  const addTrack = useCompilationStore.getState().addTrack;
  const projectTracks = useCompilationStore((s) => s.project.tracks);

  // 已添加去重集合：netease 曲目按 providerTrackId 记。
  const existingIds = useMemo(() => {
    const s = new Set<number>();
    for (const t of projectTracks) {
      if (t.provider === "netease" && typeof t.providerTrackId === "number") s.add(t.providerTrackId);
    }
    return s;
  }, [projectTracks]);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    setSelected(new Map());
    setSourcePlaylistId(undefined);
  };

  const toggle = useCallback(
    (t: CompilationTrack) => {
      setSelected((prev) => {
        const id = t.providerTrackId;
        if (typeof id !== "number") return prev;
        const next = new Map(prev);
        if (next.has(id)) next.delete(id);
        else next.set(id, t);
        return next;
      });
    },
    [setSelected]
  );

  const selectAll = useCallback(
    (tracks: CompilationTrack[]) => {
      setSelected((prev) => {
        const next = new Map(prev);
        for (const t of tracks) {
          const id = t.providerTrackId;
          if (typeof id === "number" && !existingIds.has(id)) next.set(id, t);
        }
        return next;
      });
    },
    [existingIds, setSelected]
  );
  const clearAll = useCallback(() => setSelected(new Map()), [setSelected]);

  const handleAdd = useCallback(() => {
    for (const t of selected.values()) {
      addTrack({
        ...t,
        sourcePlaylistId: activeTab === "playlists" ? sourcePlaylistId : undefined,
      });
    }
    setSelected(new Map());
    setSourcePlaylistId(undefined);
    setActiveTab("liked");
    setPickerOpen(false);
  }, [selected, addTrack, activeTab, sourcePlaylistId, setSelected, setSourcePlaylistId, setActiveTab, setPickerOpen]);

  const handleLogout = useCallback(async () => {
    abortRef.current?.abort();
    setCookie(null);
    setSelected(new Map());
    await useNeteaseStore.getState().logout();
    // logout 后 status → anonymous，登录区 effect 自动开始新一轮扫码。
  }, [setSelected]);

  const handleExpired = useCallback(() => {
    setCookie(null);
    setSelected(new Map());
    useNeteaseStore.getState().markExpired();
  }, [setSelected]);

  const available = isNeteaseAvailable();
  const widthClass = status === "logged-in" ? "md:w-[min(560px,calc(100vw-48px))]" : "md:w-[min(520px,calc(100vw-48px))]";

  return (
    <AnimatePresence>
      {pickerOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end md:items-center md:justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
        >
          <div className="absolute inset-0 bg-black/20" onClick={close} />
          <motion.div
            className={`relative flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-[20px] border-t border-[var(--line)] bg-[var(--surface)] md:h-auto md:rounded-xl md:border ${widthClass}`}
            initial={desktop ? { opacity: 0, scale: 0.98 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.98 } : { y: "100%" }}
            transition={panel}
          >
            {/* 顶部标题行 */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] px-4">
              <span className="font-mono-num text-xs tracking-widest text-[var(--muted)]">网易云添加</span>
              <div className="flex items-center gap-3">
                {status === "logged-in" && (
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="text-xs text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)]"
                  >
                    退出登录
                  </button>
                )}
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={close}
                  className="-m-1 rounded-lg p-2 text-[var(--muted)] transition-colors duration-200 hover:text-[var(--foreground)]"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 主体：登录区 / 三来源 Tab */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {!available ? (
                <div className="px-4 py-6 text-xs text-[var(--muted)]">
                  网易云功能未启用（未配置 NEXT_PUBLIC_NETEASE_API_BASE_URL），应用已回退为 Demo 音乐。
                </div>
              ) : status === "logged-in" && cookie !== null ? (
                <SourceSection
                  activeTab={activeTab}
                  onTab={switchTab}
                  userId={userId}
                  cookie={cookie}
                  existingIds={existingIds}
                  selected={selected}
                  onToggle={toggle}
                  onSelectAll={selectAll}
                  onClearAll={clearAll}
                  onRelogin={handleExpired}
                  onSourcePlaylistChange={setSourcePlaylistId}
                />
              ) : status === "logged-in" ? (
                // 已登录但 cookie 尚未重建（打开时异步 loadSession）：短暂加载占位，避免空 cookie 报错闪烁。
                <div className="px-4 py-6 text-xs text-[var(--muted)]">加载中…</div>
              ) : (
                <LoginSection booted={booted} abortRef={abortRef} onSessionCookie={setCookie} />
              )}
            </div>

            {/* 底部：添加按钮（登录后）+ 固定安全提示 */}
            {available && status === "logged-in" ? (
              <div className="shrink-0 border-t border-[var(--line)] px-4 pb-3 pt-3">
                <button
                  type="button"
                  onClick={handleAdd}
                  className={`w-full rounded-lg border border-[var(--strong-line)] py-2 text-sm text-[var(--foreground)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] ${
                    selected.size === 0 ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  添加所选（{selected.size} 首）
                </button>
              </div>
            ) : null}
            <p className="shrink-0 px-4 pb-3 text-[11px] leading-relaxed text-[var(--muted)]">{SECURITY_NOTICE}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// 登录区（内嵌）：扫码 + 状态文字 + 记住登录
// ---------------------------------------------------------------------------

function LoginSection({
  booted,
  abortRef,
  onSessionCookie,
}: {
  booted: boolean;
  abortRef: React.RefObject<AbortController | null>;
  onSessionCookie: (v: string | null) => void;
}) {
  const status = useNeteaseStore((s) => s.status);
  const remember = useNeteaseStore((s) => s.remember);
  const setRemember = useNeteaseStore((s) => s.setRemember);
  const setPending = useNeteaseStore.getState().setPending;
  const applySession = useNeteaseStore.getState().applySession;
  const markExpired = useNeteaseStore.getState().markExpired;

  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrState, setQrState] = useState<"waiting" | "scanned" | "expired" | "">("");
  const [qrError, setQrError] = useState<string | null>(null);

  const startLogin = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const prevStatus = useNeteaseStore.getState().status;
    setQrError(null);
    setQrState("");
    setQrImg(null);
    setPending();
    try {
      const key = await getQrKey();
      const qr = await createQr(key);
      if (ac.signal.aborted) return;
      // createQr 优先返回 base64 图；无图时前端生成二维码兜底。
      const img = qr.qrimg ?? (await qrToDataURL(qr.qrurl, { width: 220, margin: 1 }));
      if (ac.signal.aborted) return;
      setQrImg(img);

      const result = await pollQrCheck(key, ac.signal, (r) => {
        if (r.state === "waiting") setQrState("waiting");
        else if (r.state === "scanned") setQrState("scanned");
      });
      if (ac.signal.aborted) return;

      if (result.state === "confirmed") {
        if (!result.cookie) {
          // 803 但未返回 Cookie：视为登录失败，走失效提示。
          markExpired();
          return;
        }
        const check = await verifyLogin(result.cookie);
        if (ac.signal.aborted) return;
        if (check.ok && check.profile) {
          const rememberNow = useNeteaseStore.getState().remember;
          await saveSession(check.profile, result.cookie, rememberNow);
          // 先重建 cookie（供歌单/搜索请求使用），再切 UI——SourceSection 挂载时即可用。
          const session = await loadSession();
          onSessionCookie(session?.cookie ?? null);
          applySession({
            nickname: check.profile.nickname,
            avatarUrl: check.profile.avatarUrl,
            userId: check.profile.userId,
            remember: rememberNow,
          });
        } else {
          markExpired();
        }
      } else {
        setQrState("expired");
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      // 网络/CORS/超时等：恢复进入登录区前的状态并内联提示。
      useNeteaseStore.setState({ status: prevStatus });
      setQrError(errorText(err).message);
    }
  }, [abortRef, applySession, markExpired, onSessionCookie, setPending, setQrError, setQrImg, setQrState]);

  // 进入登录区：anonymous/pending 自动开始（或重开时重新开始）一轮扫码；
  // expired 由「重新登录」按钮手动触发（此时展示失效提示，不自动弹新二维码）。
  useEffect(() => {
    if (!booted) return;
    const st = useNeteaseStore.getState().status;
    if (st === "anonymous" || st === "pending") {
      const t = setTimeout(() => void startLogin(), 0);
      return () => clearTimeout(t);
    }
  }, [booted, startLogin]);

  const expired = status === "expired";
  const pending = status === "pending";

  return (
    <div className="flex flex-col px-4 py-5">
      {expired && (
        <div className="mb-3 flex items-center justify-between gap-2 border-l-2 border-[#dc2626]/60 px-2 py-1 text-xs leading-snug text-[#dc2626]/90">
          <span>登录已失效，请重新登录</span>
          <button
            type="button"
            onClick={() => void startLogin()}
            className="shrink-0 text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)]"
          >
            重新登录
          </button>
        </div>
      )}
      {qrError && (
        <div className="mb-3 flex items-center justify-between gap-2 border-l-2 border-[#dc2626]/60 px-2 py-1 text-xs leading-snug text-[#dc2626]/90">
          <span>{qrError}</span>
          <button type="button" onClick={() => void startLogin()} className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]">
            重试
          </button>
        </div>
      )}
      {/* 二维码：仅在轮询中显示（expired 态展示失效提示，不留过期图） */}
      <div className="flex justify-center py-2">
        {pending && qrImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrImg}
            alt="网易云扫码登录二维码"
            className="h-[200px] w-[200px] rounded-lg border border-[var(--line)] object-contain"
          />
        ) : pending ? (
          <div className="grid h-[200px] w-[200px] place-items-center rounded-lg border border-[var(--line)] text-xs text-[var(--muted)]">
            生成中…
          </div>
        ) : null}
      </div>
      {/* 状态文字 */}
      <div className="flex min-h-[20px] items-center justify-center gap-2 text-xs">
        {qrState === "scanned" ? (
          <span className="text-[var(--foreground)]">已扫码，请在手机上确认</span>
        ) : qrState === "expired" ? (
          <span className="text-[#dc2626]/90">
            二维码已过期
            <button
              type="button"
              onClick={() => void startLogin()}
              className="ml-2 border-b border-[var(--strong-line)] text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              刷新
            </button>
          </span>
        ) : pending ? (
          <span className="text-[var(--muted)]">等待扫码…</span>
        ) : null}
      </div>
      {/* 记住登录（仅本浏览器） */}
      <label className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="accent-[var(--foreground)]"
        />
        记住登录（仅本浏览器）
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 三来源 Tab
// ---------------------------------------------------------------------------

function SourceSection(props: {
  activeTab: TabId;
  onTab: (tab: TabId) => void;
  userId: number | null;
  cookie: string;
  existingIds: Set<number>;
  selected: Map<number, CompilationTrack>;
  onToggle: (t: CompilationTrack) => void;
  onSelectAll: (tracks: CompilationTrack[]) => void;
  onClearAll: () => void;
  onRelogin: () => void;
  onSourcePlaylistChange: (id: number | undefined) => void;
}) {
  const {
    activeTab,
    onTab,
    userId,
    cookie,
    existingIds,
    selected,
    onToggle,
    onSelectAll,
    onClearAll,
    onRelogin,
    onSourcePlaylistChange,
  } = props;

  const uid = userId ?? 0;

  return (
    <>
      <div className="flex shrink-0 border-b border-[var(--line)] text-sm">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTab(tab.key)}
            className={`border-b-2 px-4 py-2.5 transition-colors duration-150 ${
              activeTab === tab.key
                ? "border-[var(--strong-line)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "liked" && (
        <LikedTab uid={uid} cookie={cookie} existingIds={existingIds} selected={selected} onToggle={onToggle} onSelectAll={onSelectAll} onClearAll={onClearAll} onRelogin={onRelogin} />
      )}
      {activeTab === "playlists" && (
        <PlaylistsTab uid={uid} cookie={cookie} existingIds={existingIds} selected={selected} onToggle={onToggle} onSelectAll={onSelectAll} onClearAll={onClearAll} onRelogin={onRelogin} onSourcePlaylistChange={onSourcePlaylistChange} />
      )}
      {activeTab === "search" && (
        <SearchTab cookie={cookie} existingIds={existingIds} selected={selected} onToggle={onToggle} onSelectAll={onSelectAll} onClearAll={onClearAll} onRelogin={onRelogin} />
      )}
    </>
  );
}

interface ListViewProps {
  tracks: CompilationTrack[];
  loading: boolean;
  error: string | null;
  authExpired: boolean;
  emptyText: string;
  existingIds: Set<number>;
  selected: Map<number, CompilationTrack>;
  onToggle: (t: CompilationTrack) => void;
  onSelectAll: (tracks: CompilationTrack[]) => void;
  onClearAll: () => void;
  onRetry: () => void;
  onRelogin: () => void;
  toolbar?: ReactNode;
}

function TrackList(props: ListViewProps) {
  const {
    tracks,
    loading,
    error,
    authExpired,
    emptyText,
    existingIds,
    selected,
    onToggle,
    onSelectAll,
    onClearAll,
    onRetry,
    onRelogin,
    toolbar,
  } = props;

  const selectable = tracks.filter((t) => typeof t.providerTrackId === "number" && !existingIds.has(t.providerTrackId));
  const allSelected = selectable.length > 0 && selectable.every((t) => selected.has(t.providerTrackId as number));

  return (
    <div>
      {toolbar}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={selectable.length === 0}
            onChange={(e) => {
              if (e.target.checked) onSelectAll(selectable);
              else onClearAll();
            }}
            className="accent-[var(--foreground)] disabled:opacity-40"
          />
          全选
        </label>
        <span className="font-mono-num text-[11px] text-[var(--muted)]">已添加 {existingIds.size} 首</span>
      </div>

      {error ? (
        <div className="mx-4 mt-2 flex items-center justify-between gap-2 border-l-2 border-[#dc2626]/60 px-2 py-1 text-xs leading-snug text-[#dc2626]/90">
          <span>{error}</span>
          {authExpired ? (
            <button type="button" onClick={onRelogin} className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]">
              请重新登录 →
            </button>
          ) : (
            <button type="button" onClick={onRetry} className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]">
              重试
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="px-4 py-6 text-xs text-[var(--muted)]">加载中…</div>
      ) : tracks.length === 0 ? (
        <div className="px-4 py-6 text-xs text-[var(--muted)]">{emptyText}</div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {tracks.map((t) => (
            <TrackRow
              key={t.providerTrackId ?? t.id}
              track={t}
              existing={typeof t.providerTrackId === "number" && existingIds.has(t.providerTrackId)}
              checked={typeof t.providerTrackId === "number" && selected.has(t.providerTrackId)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TrackRow({
  track,
  existing,
  checked,
  onToggle,
}: {
  track: CompilationTrack;
  existing: boolean;
  checked: boolean;
  onToggle: (t: CompilationTrack) => void;
}) {
  return (
    <li className="flex items-center gap-2 px-4 py-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={existing}
        onChange={() => onToggle(track)}
        className="shrink-0 accent-[var(--foreground)] disabled:opacity-40"
        aria-label={existing ? "已添加" : "选择歌曲"}
      />
      <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--line)] bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] text-[var(--muted)]">
        {track.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artworkUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Disc3 size={15} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-[var(--foreground)]">{track.title}</span>
        <span className="block truncate text-xs text-[var(--muted)]">{track.artist}</span>
      </span>
      <span className="shrink-0 font-mono-num text-xs text-[var(--muted)]">{formatTime((track.durationMs ?? 0) / 1000)}</span>
      {existing && <span className="shrink-0 text-[11px] text-[var(--muted)]">✓ 已添加</span>}
    </li>
  );
}

// —— 我喜欢的音乐 ——

function LikedTab(props: {
  uid: number;
  cookie: string;
  existingIds: Set<number>;
  selected: Map<number, CompilationTrack>;
  onToggle: (t: CompilationTrack) => void;
  onSelectAll: (tracks: CompilationTrack[]) => void;
  onClearAll: () => void;
  onRelogin: () => void;
}) {
  const { uid, cookie, existingIds, selected, onToggle, onSelectAll, onClearAll, onRelogin } = props;
  const [tracks, setTracks] = useState<CompilationTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; authExpired: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve(); // 把 setState 移出 effect 同步体，避免级联渲染告警
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const ids = await getLikedTrackIds(uid, cookie);
        const list = await getSongsByIds(ids, cookie);
        if (!cancelled) setTracks(list);
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, cookie, reloadKey]);

  return (
    <TrackList
      tracks={tracks}
      loading={loading}
      error={error?.message ?? null}
      authExpired={error?.authExpired ?? false}
      emptyText="暂无红心歌曲"
      existingIds={existingIds}
      selected={selected}
      onToggle={onToggle}
      onSelectAll={onSelectAll}
      onClearAll={onClearAll}
      onRetry={() => setReloadKey((k) => k + 1)}
      onRelogin={onRelogin}
    />
  );
}

// —— 我的歌单 ——

function PlaylistsTab(props: {
  uid: number;
  cookie: string;
  existingIds: Set<number>;
  selected: Map<number, CompilationTrack>;
  onToggle: (t: CompilationTrack) => void;
  onSelectAll: (tracks: CompilationTrack[]) => void;
  onClearAll: () => void;
  onRelogin: () => void;
  onSourcePlaylistChange: (id: number | undefined) => void;
}) {
  const { uid, cookie, existingIds, selected, onToggle, onSelectAll, onClearAll, onRelogin, onSourcePlaylistChange } = props;
  const [playlists, setPlaylists] = useState<NeteasePlaylistSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<{ message: string; authExpired: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 当前打开的歌单（id + 名称）。
  const [current, setCurrent] = useState<{ id: number; name: string } | null>(null);
  const [tracks, setTracks] = useState<CompilationTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [trackError, setTrackError] = useState<{ message: string; authExpired: boolean } | null>(null);
  const [trackReloadKey, setTrackReloadKey] = useState(0);

  // 歌单列表
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadingList(true);
      setListError(null);
      try {
        const list = await getUserPlaylists(uid, cookie);
        if (!cancelled) setPlaylists(list);
      } catch (err) {
        if (!cancelled) setListError(errorText(err));
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, cookie, reloadKey]);

  // 当前歌单曲目
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (!current) {
        setTracks([]);
        setLoadingTracks(false);
        setTrackError(null);
        return;
      }
      setLoadingTracks(true);
      setTrackError(null);
      try {
        const list = await getPlaylistTracks(current.id, cookie);
        if (!cancelled) setTracks(list);
      } catch (err) {
        if (!cancelled) setTrackError(errorText(err));
      } finally {
        if (!cancelled) setLoadingTracks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current, cookie, trackReloadKey]);

  const openPlaylist = (id: number, name: string) => {
    setCurrent({ id, name });
    onSourcePlaylistChange(id);
  };
  const backToList = () => {
    setCurrent(null);
    onSourcePlaylistChange(undefined);
    onClearAll(); // 不跨歌单残留选择，避免 handleAdd 用错误 sourcePlaylistId 打标
  };

  if (current) {
    return (
      <div>
        <div className="flex items-center gap-1 border-b border-[var(--line)] px-4 py-2 text-xs">
          <button
            type="button"
            onClick={backToList}
            className="text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)]"
          >
            ← 返回歌单
          </button>
          <span className="truncate font-mono-num text-[var(--muted)]">/ {current.name}</span>
        </div>
        <TrackList
          tracks={tracks}
          loading={loadingTracks}
          error={trackError?.message ?? null}
          authExpired={trackError?.authExpired ?? false}
          emptyText="歌单暂无歌曲"
          existingIds={existingIds}
          selected={selected}
          onToggle={onToggle}
          onSelectAll={onSelectAll}
          onClearAll={onClearAll}
          onRetry={() => setTrackReloadKey((k) => k + 1)}
          onRelogin={onRelogin}
        />
      </div>
    );
  }

  return (
    <div>
      {listError ? (
        <div className="mx-4 mt-2 flex items-center justify-between gap-2 border-l-2 border-[#dc2626]/60 px-2 py-1 text-xs leading-snug text-[#dc2626]/90">
          <span>{listError.message}</span>
          {listError.authExpired ? (
            <button type="button" onClick={onRelogin} className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]">
              请重新登录 →
            </button>
          ) : (
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]">
              重试
            </button>
          )}
        </div>
      ) : loadingList ? (
        <div className="px-4 py-6 text-xs text-[var(--muted)]">加载中…</div>
      ) : playlists.length === 0 ? (
        <div className="px-4 py-6 text-xs text-[var(--muted)]">暂无歌单</div>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {playlists.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openPlaylist(p.id, p.name)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]"
              >
                <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--line)] bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] text-[var(--muted)]">
                  {p.coverImgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverImgUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <Disc3 size={15} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--foreground)]">{p.name}</span>
                  <span className="block font-mono-num text-[10px] text-[var(--muted)]">{p.trackCount} 首</span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-[var(--muted)]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// —— 搜索 ——

function SearchTab(props: {
  cookie: string;
  existingIds: Set<number>;
  selected: Map<number, CompilationTrack>;
  onToggle: (t: CompilationTrack) => void;
  onSelectAll: (tracks: CompilationTrack[]) => void;
  onClearAll: () => void;
  onRelogin: () => void;
}) {
  const { cookie, existingIds, selected, onToggle, onSelectAll, onClearAll, onRelogin } = props;
  const [keyword, setKeyword] = useState("");
  const [tracks, setTracks] = useState<CompilationTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; authExpired: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 防抖 ~400ms 搜索；无关键词 → 空态。
  useEffect(() => {
    const kw = keyword.trim();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (!kw) {
        setTracks([]);
        setLoading(false);
        setError(null);
        return;
      }
      // 先等防抖窗口，再进 loading——避免每敲一个字都闪「加载中…」。
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 400);
      });
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const body = await neteaseClient.request<NeteaseSearchResponse>("/search", {
          params: { keywords: kw, limit: 20 },
          cookie,
        });
        const songs = body.result?.songs ?? [];
        if (!cancelled) setTracks(songs.map(normalizeTrack));
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [keyword, cookie, reloadKey]);

  return (
    <div>
      <div className="border-b border-[var(--line)] px-4 py-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入关键词搜索歌曲"
          className="w-full border-b border-[var(--line)] bg-transparent py-1 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
        />
      </div>
      {!keyword.trim() ? (
        <div className="px-4 py-6 text-xs text-[var(--muted)]">输入关键词搜索歌曲</div>
      ) : (
        <TrackList
          tracks={tracks}
          loading={loading}
          error={error?.message ?? null}
          authExpired={error?.authExpired ?? false}
          emptyText="未找到相关歌曲"
          existingIds={existingIds}
          selected={selected}
          onToggle={onToggle}
          onSelectAll={onSelectAll}
          onClearAll={onClearAll}
          onRetry={() => setReloadKey((k) => k + 1)}
          onRelogin={onRelogin}
        />
      )}
    </div>
  );
}
