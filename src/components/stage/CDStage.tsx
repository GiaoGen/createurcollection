"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useRef, useSyncExternalStore } from "react";
import { useCompilationStore } from "@/store/use-compilation-store";
import { CDCase } from "./CDCase";
import { StageLights } from "./StageLights";
import { StageFallback } from "./StageFallback";
import { isWebGLAvailable } from "./lib";

type GLStatus = "pending" | "ok" | "no";

/**
 * Detect WebGL availability without a hydration mismatch.
 *
 * Note: the brief's `useMemo(isWebGLAvailable, [])` would render the CSS
 * fallback in the server HTML and the <Canvas> on the client (hydration
 * mismatch). useSyncExternalStore renders the "pending" snapshot on the
 * server and during hydration, then swaps to the real result on the client.
 */
const subscribeNoop = () => () => {};

function useIsWebGLAvailable(): GLStatus {
  return useSyncExternalStore(
    subscribeNoop,
    () => (isWebGLAvailable() ? "ok" : "no"),
    () => "pending"
  );
}

export function CDStage() {
  const theme = useCompilationStore((s) => s.project.theme);
  const face = useCompilationStore((s) => s.face);
  const containerRef = useRef<HTMLDivElement>(null);
  const glStatus = useIsWebGLAvailable();
  const viewAngle = useRef<{ x: number; y: number }>({ x: 0.2, y: 0.6 });

  if (glStatus === "pending") {
    // SSR + first client render: neutral background (matches server HTML).
    return <div className="h-full w-full bg-[var(--background)]" />;
  }
  if (glStatus === "no") return <StageFallback />;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[var(--background)]"
    >
      {/* 极轻网格/噪点背景（CSS） */}
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0.4, 6.5], fov: 42 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.style.touchAction = "none"; // one-finger drag beats scroll/zoom
        }}
      >
        <Suspense fallback={null}>
          <StageLights theme={theme} />
          <CDCase viewAngleRef={viewAngle} face={face} />
        </Suspense>
      </Canvas>
      {/* 左上角当前编辑对象标识 */}
      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.3em] uppercase text-[var(--muted)]">
        {face === "front" ? "Front Cover" : face === "back" ? "Back Cover" : "Disc"}
      </div>
    </div>
  );
}
