/**
 * The page's atmosphere: a static composed field behind all routes.
 *
 * Previously two blurred blobs ran infinite scale/opacity loops. On the iOS build
 * that is continuous compositing work for motion nobody asked for, and there was no
 * prefers-reduced-motion guard. The depth here comes from layered radial tone
 * instead, which costs nothing after first paint.
 */
export function BackgroundMesh() {
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-mesh" />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
