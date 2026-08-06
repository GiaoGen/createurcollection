"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";

const DISC_RADIUS = 0.78;
const DISC_THICK = 0.025;
/** Sits in the tray, under the closed lid (THICK/2 = 0.09; disc top ≈ 0.0925). */
const DISC_Z = 0.08;
/** Spin speed from the cd-showcase-3d template (2.8 rad/s). */
const SPIN_RAD_PER_S = 2.8;

interface DiscProps {
  texture: THREE.Texture;
  isPlaying: boolean;
}

export function Disc({ texture, isPlaying }: DiscProps) {
  const discRef = useRef<THREE.Mesh>(null);
  const speed = useRef(0);

  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS, DISC_THICK, 64);
    g.rotateX(Math.PI / 2); // lay the disc flat: axis along +z, top cap facing the camera
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, dt) => {
    const disc = discRef.current;
    if (!disc) return;
    // Exponential accel/decel to/from the spin speed — no abrupt stop on pause.
    const target = isPlaying ? SPIN_RAD_PER_S : 0;
    speed.current += (target - speed.current) * (1 - Math.exp(-dt * (isPlaying ? 8 : 1.2)));
    disc.rotation.z -= speed.current * dt;
    // Keep the demand frame loop alive only while the disc is actually moving.
    if (Math.abs(speed.current) > 0.001) state.invalidate();
  });

  return (
    <mesh ref={discRef} geometry={geometry} position={[0, 0, DISC_Z]}>
      <meshStandardMaterial map={texture} roughness={0.5} />
    </mesh>
  );
}
