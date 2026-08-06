"use client";

import { useFrame } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import * as THREE from "three";
import { useRef, useState } from "react";

/** ~0.5s exponential approach rate for light transitions (1 - e^(-k·dt)). */
const LERP_K = 4.5;
/** Intensity below this counts as settled → the demand loop stops. */
const INT_EPS = 0.001;
/** Channel-delta (0..~3) below which a colour counts as settled. */
const COL_EPS = 0.01;

/** Sum of absolute RGB channel deltas — a cheap colour distance for settle checks. */
function colorDelta(a: THREE.Color, b: THREE.Color): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

interface LightTargets {
  ambient: number;
  key: number;
  fill: number;
  hemi: number;
  /** Hemisphere sky — the environment tint (warm light / cool dark). */
  hemiSky: THREE.Color;
  /** Cool fill — identical across themes today, kept on the same lerp path. */
  fillColor: THREE.Color;
}

const THEME_LIGHT: Record<"light" | "dark", LightTargets> = {
  light: {
    ambient: 0.9,
    key: 1.6,
    fill: 0.6,
    hemi: 0.4,
    hemiSky: new THREE.Color("#ffffff"),
    fillColor: new THREE.Color("#b8c4d8"),
  },
  dark: {
    ambient: 0.5,
    key: 1.0,
    fill: 0.4,
    hemi: 0.25,
    hemiSky: new THREE.Color("#1a1f2a"),
    fillColor: new THREE.Color("#b8c4d8"),
  },
};

/**
 * Lights that lerp toward per-theme targets (~0.5s) instead of the old
 * `key={theme}` remount, which snapped the whole group abruptly.
 *
 * The group is now stable; useFrame owns intensity/colour and only calls
 * `state.invalidate()` while a transition is in flight (the Canvas runs with
 * `frameloop="demand"`, so the loop stops once everything settles). Under
 * `prefers-reduced-motion` the switch is instant instead.
 *
 * The JSX `intensity`/`color`/`args` are initial-only — kept stable across
 * renders via a mount-time `theme` snapshot. Were they theme-dependent, R3F
 * would re-apply them instantly on every theme change and defeat the lerp.
 */
export function StageLights({ theme }: { theme: "light" | "dark" }) {
  const reduced = useReducedMotion();
  // Mount-time theme snapshot — `useState` (never updated) rather than a ref,
  // so the JSX initial props stay stable across re-renders without touching
  // a ref value during render (react-hooks/refs).
  const [initial] = useState(theme);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    const ambient = ambientRef.current;
    const key = keyRef.current;
    const fill = fillRef.current;
    const hemi = hemiRef.current;
    if (!ambient || !key || !fill || !hemi) return;

    const t = THEME_LIGHT[theme];

    if (reduced) {
      ambient.intensity = t.ambient;
      key.intensity = t.key;
      fill.intensity = t.fill;
      hemi.intensity = t.hemi;
      hemi.color.copy(t.hemiSky);
      fill.color.copy(t.fillColor);
      return;
    }

    const settled =
      Math.abs(ambient.intensity - t.ambient) < INT_EPS &&
      Math.abs(key.intensity - t.key) < INT_EPS &&
      Math.abs(fill.intensity - t.fill) < INT_EPS &&
      Math.abs(hemi.intensity - t.hemi) < INT_EPS &&
      colorDelta(hemi.color, t.hemiSky) < COL_EPS &&
      colorDelta(fill.color, t.fillColor) < COL_EPS;
    if (settled) return;

    const k = 1 - Math.exp(-d * LERP_K);
    ambient.intensity += (t.ambient - ambient.intensity) * k;
    key.intensity += (t.key - key.intensity) * k;
    fill.intensity += (t.fill - fill.intensity) * k;
    hemi.intensity += (t.hemi - hemi.intensity) * k;
    hemi.color.lerp(t.hemiSky, k);
    fill.color.lerp(t.fillColor, k);
    state.invalidate();
  });

  return (
    <group>
      <ambientLight ref={ambientRef} intensity={THEME_LIGHT[initial].ambient} />
      <directionalLight ref={keyRef} position={[4, 6, 5]} intensity={THEME_LIGHT[initial].key} />
      <directionalLight
        ref={fillRef}
        position={[-4, -2, 3]}
        intensity={THEME_LIGHT[initial].fill}
        color={THEME_LIGHT[initial].fillColor}
      />
      <hemisphereLight
        ref={hemiRef}
        args={[THEME_LIGHT[initial].hemiSky, "#000000", THEME_LIGHT[initial].hemi]}
      />
    </group>
  );
}
