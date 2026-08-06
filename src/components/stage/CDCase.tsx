"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useCompilationStore } from "@/store/use-compilation-store";
import type { FaceTarget } from "@/types/compilation";
import { Disc } from "./Disc";
import { clamp, useArtworkTexture, useSpineTexture, useTrayTexture } from "./lib";

/* Case geometry — proportional to the skill template's T.CASE_S / THICK. */
const CASE_W = 2.6;
const CASE_H = 2.0;
const THICK = 0.18;

/* Gesture constants (from cd-showcase-3d assets/template.html). */
const DRAG_SPEED = 0.0045;
const DRAG_LIMIT_Y = 0.7;
const DRAG_LIMIT_X = 0.35;
const PARALLAX_X = 0.05;
const PARALLAX_Y = 0.07;
const TAP_PX = 6; // pointer travel below this counts as a tap, not a drag

/* Open-state targets: lid gap ~12° (0.22 rad), disc slides out exposing ~2/3. */
const LID_OPEN = 0.22;
const DISC_SLIDE = 1.5;

/* Lid hinge spring (stiffness 110 / damping 22 / mass 1.1). */
const SPRING_K = 110;
const SPRING_C = 22;
const SPRING_M = 1.1;

interface CDCaseProps {
  face: FaceTarget;
  viewAngleRef: RefObject<{ x: number; y: number }>;
}

export function CDCase({ face, viewAngleRef }: CDCaseProps) {
  const groupRef = useRef<THREE.Group>(null); // outer: face-driven yaw (0 / π / π/2)
  const viewGroupRef = useRef<THREE.Group>(null); // inner: base view + drag + parallax
  const caseGroupRef = useRef<THREE.Group>(null); // clickable assembly
  const lidRef = useRef<THREE.Group>(null);
  const discGroupRef = useRef<THREE.Group>(null);

  const project = useCompilationStore((s) => s.project);
  const isPlaying = useCompilationStore((s) => s.player.isPlaying);
  const activeTrackId = useCompilationStore((s) => s.project.activeTrackId);
  const setFace = useCompilationStore((s) => s.setFace);

  const frontTex = useArtworkTexture(project.frontCover.imageUrl, project.frontCover.filter, "cover");
  const backTex = useArtworkTexture(
    project.backCover.imageUrl,
    project.backCover.filter,
    "cover",
    true // back cover is seen from the back of the case → un-mirror it
  );
  const discTex = useArtworkTexture(project.discArtwork.imageUrl, project.discArtwork.filter, "disc");
  const spineTex = useSpineTexture(project.frontCover.imageUrl, project.title, project.spineStyle);
  const trayTex = useTrayTexture();

  const targetY = useMemo(() => {
    switch (face) {
      case "front":
        return 0;
      case "back":
        return Math.PI;
      case "disc":
        return Math.PI / 2; // side view so the disc extraction is observable
    }
  }, [face]);

  // Interaction state — refs only, no per-frame setState.
  const openRef = useRef(false);
  const dragging = useRef(false);
  const dragMoved = useRef(0);
  const didDrag = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const dragRot = useRef({ x: 0, y: 0 });
  const dragVel = useRef({ x: 0, y: 0 });
  const parCur = useRef({ x: 0, y: 0 });
  const parTarget = useRef({ x: 0, y: 0 });
  const lidAngle = useRef(0);
  const lidVel = useRef(0);
  const discX = useRef(0);

  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  /* Unified Pointer Events on the canvas DOM element — mouse + touch, one code
     path, zero hover dependency. Single-finger drag rotates; tap = open/close. */
  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      dragMoved.current = 0;
      didDrag.current = false;
      lastPos.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
      invalidate();
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      parTarget.current.y = clamp(nx, -1, 1) * PARALLAX_Y;
      parTarget.current.x = -clamp(ny, -1, 1) * PARALLAX_X;
      if (dragging.current) {
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        dragMoved.current += Math.abs(dx) + Math.abs(dy);
        if (dragMoved.current > TAP_PX) didDrag.current = true;
        dragRot.current.y = clamp(dragRot.current.y + dx * DRAG_SPEED, -DRAG_LIMIT_Y, DRAG_LIMIT_Y);
        dragRot.current.x = clamp(dragRot.current.x + dy * DRAG_SPEED * 0.7, -DRAG_LIMIT_X, DRAG_LIMIT_X);
        dragVel.current.y = dx * DRAG_SPEED;
        dragVel.current.x = dy * DRAG_SPEED * 0.7;
        lastPos.current = { x: e.clientX, y: e.clientY };
      }
      invalidate();
    };
    const onUp = () => {
      dragging.current = false;
      invalidate();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl, invalidate]);

  /** Tap on the case: snap to front (when opening) + toggle open/close. */
  const handleTap = () => {
    if (didDrag.current) return; // a drag ending over the case is not a tap
    if (!openRef.current) setFace("front");
    openRef.current = !openRef.current;
    invalidate();
  };

  useFrame((state, dt) => {
    const g = groupRef.current;
    const view = viewGroupRef.current;
    if (!g || !view) return;

    // Face tabs drive a smoothed target yaw — exponential damping, no setState.
    const k = 1 - Math.exp(-dt * 6);
    g.rotation.y += (targetY - g.rotation.y) * k;
    if (Math.abs(targetY - g.rotation.y) < 0.001) g.rotation.y = targetY;

    // Drag inertia + ease-back (velocity *exp(-dt*6), angle lerp 1-exp(-dt*3)).
    if (!dragging.current) {
      const vDamp = Math.exp(-dt * 6);
      const rDamp = 1 - Math.exp(-dt * 3);
      dragVel.current.x *= vDamp;
      dragVel.current.y *= vDamp;
      dragRot.current.y = clamp(dragRot.current.y + dragVel.current.y, -DRAG_LIMIT_Y, DRAG_LIMIT_Y);
      dragRot.current.x = clamp(dragRot.current.x + dragVel.current.x, -DRAG_LIMIT_X, DRAG_LIMIT_X);
      dragRot.current.x += (0 - dragRot.current.x) * rDamp;
      dragRot.current.y += (0 - dragRot.current.y) * rDamp;
    }

    // Mouse parallax, smoothed 1-exp(-dt*4).
    const dPar = 1 - Math.exp(-dt * 4);
    parCur.current.x += (parTarget.current.x - parCur.current.x) * dPar;
    parCur.current.y += (parTarget.current.y - parCur.current.y) * dPar;

    const va = viewAngleRef.current;
    view.rotation.x = va.x + dragRot.current.x + parCur.current.x;
    view.rotation.y = va.y + dragRot.current.y + parCur.current.y;

    // Lid hinge spring → ~0.22 rad open.
    const lidTarget = openRef.current ? LID_OPEN : 0;
    const a = (lidTarget - lidAngle.current) * (SPRING_K / SPRING_M) - lidVel.current * (SPRING_C / SPRING_M);
    lidVel.current += a * dt;
    lidAngle.current += lidVel.current * dt;
    if (lidRef.current) lidRef.current.rotation.x = lidAngle.current;

    // Disc slide-out (~2/3 exposed), symmetric speed open ↔ close.
    const discTarget = openRef.current ? DISC_SLIDE : 0;
    const dDisc = 1 - Math.exp(-dt * 3);
    discX.current += (discTarget - discX.current) * dDisc;
    if (discGroupRef.current) discGroupRef.current.position.x = discX.current;

    // Keep the demand frame loop alive only while something is still moving.
    const moving =
      Math.abs(g.rotation.y - targetY) > 0.001 ||
      Math.abs(lidTarget - lidAngle.current) > 0.0005 ||
      Math.abs(discTarget - discX.current) > 0.0005 ||
      Math.abs(dragRot.current.x) > 0.0001 ||
      Math.abs(dragRot.current.y) > 0.0001 ||
      Math.abs(parCur.current.x - parTarget.current.x) > 0.0001 ||
      Math.abs(parCur.current.y - parTarget.current.y) > 0.0001;
    if (moving) state.invalidate();
  });

  const themeColor = project.theme === "dark" ? "#151515" : "#f0f0ee";

  return (
    <group ref={groupRef}>
      <group ref={viewGroupRef}>
        <group ref={caseGroupRef} onClick={handleTap}>
          {/* Case body — rounded shell that defines the silhouette */}
          <RoundedBox args={[CASE_W, CASE_H, THICK]} radius={0.04} smoothness={4}>
            <meshStandardMaterial color={themeColor} roughness={0.85} />
          </RoundedBox>
          {/* Tray face (visible when the lid is open) */}
          <mesh position={[0, 0, THICK / 2 + 0.005]}>
            <planeGeometry args={[CASE_W, CASE_H]} />
            <meshStandardMaterial map={trayTex} roughness={0.9} />
          </mesh>
          {/* Back cover */}
          <mesh position={[0, 0, -THICK / 2 - 0.005]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[CASE_W, CASE_H]} />
            <meshStandardMaterial map={backTex} roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
          {/* Spine on the right edge (vertical title) */}
          <mesh position={[CASE_W / 2 + THICK / 2 + 0.005, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[THICK, CASE_H]} />
            <meshStandardMaterial map={spineTex} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          {/* Lid (front cover) — bottom-edge hinge */}
          <group ref={lidRef} position={[0, -CASE_H / 2, THICK / 2 + 0.025]}>
            <RoundedBox args={[CASE_W, CASE_H, 0.03]} radius={0.02} smoothness={4} position={[0, CASE_H / 2, 0]}>
              <meshStandardMaterial map={frontTex} roughness={0.55} />
            </RoundedBox>
          </group>
          {/* Disc — slides out along +x and spins */}
          <group ref={discGroupRef}>
            <Disc texture={discTex} isPlaying={isPlaying && !!activeTrackId} />
          </group>
        </group>
      </group>
    </group>
  );
}
