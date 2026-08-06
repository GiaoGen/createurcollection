/**
 * Lights react to `theme` (dark = lower intensities, cooler fill).
 * Instant switch for now; smoothing is Task 14.
 * The `key` remounts the whole group so colors/hardness swap with the theme.
 */
export function StageLights({ theme }: { theme: "light" | "dark" }) {
  const key = theme;
  return (
    <group key={key}>
      <ambientLight intensity={theme === "dark" ? 0.5 : 0.9} />
      <directionalLight position={[4, 6, 5]} intensity={theme === "dark" ? 1.0 : 1.6} />
      <directionalLight
        position={[-4, -2, 3]}
        intensity={theme === "dark" ? 0.4 : 0.6}
        color="#b8c4d8"
      />
      <hemisphereLight
        args={[theme === "dark" ? "#1a1f2a" : "#ffffff", "#000000", theme === "dark" ? 0.25 : 0.4]}
      />
    </group>
  );
}
