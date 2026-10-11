import type { Member } from "@web/components/landing/demo"

/**
 * A small geometric portrait: a tinted disc, a head and shoulders, and one
 * distinguishing shape (hair, a cap, glasses) per person. Drawn, not photographed.
 */
export function CastAvatar({ member, size = 32, className }: { member: Pick<Member, "name" | "color" | "look">; size?: number; className?: string }) {
  const ink = "color-mix(in srgb, var(--bg) 88%, transparent)"
  return (
    <span
      role="img"
      aria-label={member.name}
      className={className}
      style={{ display: "inline-block", width: size, height: size, flex: "none", borderRadius: "50%", overflow: "hidden", background: `color-mix(in srgb, ${member.color} 78%, var(--panel))`, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.06)" }}
    >
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <path d="M4 32c1-7 6-10.5 12-10.5S27 25 28 32z" fill={ink} />
        <circle cx="16" cy="13" r="5.6" fill={ink} />
        {member.look === 0 ? <path d="M10 12.5c0-4 2.6-6 6.2-6 3.4 0 5.8 2 5.8 5.6-2-1.6-4.6-2.4-12-.4z" fill={member.color} /> : null}
        {member.look === 1 ? <path d="M10.4 12c.4-3.6 2.8-5.4 5.8-5.4S21.6 8.4 21.8 12c-3.6-1.8-7.6-1.8-11.4 0z" fill={member.color} /> : null}
        {member.look === 2 ? <path d="M9.6 17.5c-1-6 1.4-11 6.6-11s7.6 5 6.4 11c-.4-3-1.4-5-2.4-5.8-2.6 1-6.2.8-8.6-.2-.9 1.2-1.6 3.2-2 6z" fill={member.color} /> : null}
        {member.look === 3 ? <><circle cx="16" cy="8" r="3.2" fill={member.color} /><path d="M10.2 12.4c1.8-2.4 9.8-2.4 11.6 0-3.4-1.2-8.2-1.2-11.6 0z" fill={member.color} /></> : null}
        {member.look === 4 ? <g fill="none" stroke={member.color} strokeWidth="1.5"><circle cx="13.4" cy="13.2" r="2.2" /><circle cx="18.6" cy="13.2" r="2.2" /><path d="M15.6 13.2h.8" /></g> : null}
      </svg>
    </span>
  )
}
