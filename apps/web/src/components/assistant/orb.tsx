import type { Phase } from "@web/components/assistant/use-assistant"

/**
 * The assistant's mark: a soft lit sphere with a slow orbiting highlight. All
 * motion is CSS transform/opacity (see assistant.css) and stops under reduced
 * motion. `phase` changes only the pace and brightness, never the shape.
 */
export function Orb({ size = 22, phase = "idle", className = "" }: { size?: number; phase?: Phase; className?: string }) {
  return (
    <span className={`pf-orb ${phase === "idle" ? "" : "is-busy"} ${phase === "writing" ? "is-writing" : ""} ${className}`} style={{ width: size, height: size }} aria-hidden>
      <span className="pf-orb-glow" />
      <span className="pf-orb-spin" />
      <span className="pf-orb-core" />
    </span>
  )
}
