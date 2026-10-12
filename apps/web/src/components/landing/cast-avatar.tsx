import type { Member } from "@web/components/landing/demo"

/**
 * Illustrated portraits (never photographs): a soft gradient backdrop, shaded head and neck, hair with a highlight,
 * clothing and a few facial features, in one consistent semi-realistic style. One per cast member (`look`), drawn as
 * a small SVG so a dozen of them cost a couple of KB. Gradient ids are per look, and identical wherever repeated.
 */
type Look = { bg: [string, string]; skin: [string, string, string]; hair: [string, string]; top: [string, string]; brow: string }
const LOOKS: Look[] = [
  { bg: ["#cfe0ff", "#7fa2ee"], skin: ["#d9a07a", "#b97c58", "#efc3a2"], hair: ["#3a2a22", "#171010"], top: ["#33466b", "#1d2a47"], brow: "#1f1512" },
  { bg: ["#ffe6bd", "#f0a95a"], skin: ["#f3cfb0", "#d9a982", "#fbe3cd"], hair: ["#a1723f", "#6a4524"], top: ["#2f8a86", "#1d5f5c"], brow: "#5a3b1f" },
  { bg: ["#ffd3e0", "#e77fa4"], skin: ["#b5764b", "#8f5732", "#d29568"], hair: ["#2a1b17", "#0e0807"], top: ["#c2457d", "#8c2858"], brow: "#150c0a" },
  { bg: ["#e2d6ff", "#a48be8"], skin: ["#7b4a2c", "#5a3119", "#9b673f"], hair: ["#231815", "#0b0706"], top: ["#d9a529", "#a87612"], brow: "#0e0807" },
  { bg: ["#ffd9cc", "#ee8a68"], skin: ["#ecc09d", "#cf9873", "#f7dcc3"], hair: ["#c4602f", "#8a3b17"], top: ["#4b7f5a", "#2d5a3b"], brow: "#7a3a1a" },
]

export function CastAvatar({ member, size = 32, className }: { member: Pick<Member, "name" | "color" | "look">; size?: number; className?: string }) {
  const L = LOOKS[member.look]!
  const k = member.look
  const id = (n: string) => `ca${k}-${n}`
  const [skin, shade, light] = L.skin
  return (
    <span role="img" aria-label={member.name} className={className} style={{ display: "block", width: size, height: size, flex: "none", borderRadius: "50%", overflow: "hidden", boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)", lineHeight: 0 }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={id("bg")} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={L.bg[0]} /><stop offset="1" stopColor={L.bg[1]} /></linearGradient>
          <radialGradient id={id("face")} cx="0.4" cy="0.35" r="0.8"><stop offset="0" stopColor={light} /><stop offset="0.45" stopColor={skin} /><stop offset="1" stopColor={shade} /></radialGradient>
          <linearGradient id={id("hair")} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={L.hair[0]} /><stop offset="1" stopColor={L.hair[1]} /></linearGradient>
          <linearGradient id={id("top")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={L.top[0]} /><stop offset="1" stopColor={L.top[1]} /></linearGradient>
        </defs>
        <rect width="64" height="64" fill={`url(#${id("bg")})`} />
        <circle cx="50" cy="12" r="14" fill="#fff" opacity="0.18" />
        <g transform="translate(32 31) scale(1.16) translate(-32 -31)">
        {/* hair behind the head */}
        {k === 2 ? <path d="M17 30c-2-14 6-22 15-22s17 8 15 22c1 9 3 15 5 19H12c2-4 4-10 5-19z" fill={`url(#${id("hair")})`} /> : null}
        {k === 3 ? <circle cx="32" cy="22" r="17" fill={`url(#${id("hair")})`} /> : null}
        {/* shoulders and clothing */}
        <path d="M4 64c1-11 11-17 28-17s27 6 28 17z" fill={`url(#${id("top")})`} />
        {k === 0 ? <path d="M23 49c3 5 15 5 18 0l2 4c-4 6-18 6-22 0z" fill="#1b2640" opacity="0.7" /> : null}
        {k === 1 ? <path d="M25 48.5c2 4 12 4 14 0l1.4 2c-3 5-13 5-16.8 0z" fill="#134745" opacity="0.55" /> : null}
        {k === 4 ? <path d="M22 49c3 6 17 6 20 0l3 3c-5 8-21 8-26 0z" fill="#25472f" opacity="0.7" /> : null}
        {/* neck with a soft shadow under the chin */}
        <path d="M27 38h10v9c-2 3-8 3-10 0z" fill={shade} />
        <path d="M27 41c3 3 7 3 10 0v-3H27z" fill="#000" opacity="0.14" />
        {/* ears, head */}
        <ellipse cx="20.6" cy="29.5" rx="2.1" ry="3" fill={shade} />
        <ellipse cx="43.4" cy="29.5" rx="2.1" ry="3" fill={shade} />
        <ellipse cx="32" cy="28.5" rx="11.2" ry="13.4" fill={`url(#${id("face")})`} />
        {/* hair in front */}
        {k === 0 ? <path d="M20.5 27c-1.5-9 4-15.5 12-15.5 7.500 0 12.500 5.500 11 15.500-1.200-4-3.500-6.500-6.500-7.500-5 2-12 2-16 0z" fill={`url(#${id("hair")})`} /> : null}
        {k === 1 ? <path d="M20.6 28c-2-9.500 3.500-16.500 12-16.500 8.500 0 13.500 6.500 11 16.500-1-4-2.200-6.800-4.800-8.200-3 1.600-8.200 1.600-12-.4-1.800 2-2.600 5-2.200 8.600z" fill={`url(#${id("hair")})`} /> : null}
        {k === 2 ? <path d="M20.800 29c-1-9 3-17 11.500-17s12.500 8 11 17c-1.200-6-4-9.800-7-10.500-5 3-11 3-14 .5-1 2-1.600 6-1.500 10z" fill={`url(#${id("hair")})`} /> : null}
        {k === 3 ? <path d="M20.500 26.500c0-7 5-11.500 11.500-11.500s11.500 4.500 11.500 11.500c-2.500-3-5-4.500-7-5-3.500 1.500-9.500 1.500-13-.2-1.300 1-2.500 2.800-3 5.200z" fill={`url(#${id("hair")})`} /> : null}
        {k === 4 ? <path d="M20.500 27.500c-1.500-9 4-16 12-16 8.500 0 13 7 11 16-1-4-3-7-5.500-8.500-4.500 2-10.500 1.500-14-.5-1.500 2.500-2.800 5.500-3.500 9z" fill={`url(#${id("hair")})`} /> : null}
        {/* a light catch on the hair */}
        <path d="M25 15.500c3-1.800 8-2 11 0" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.400" strokeLinecap="round" />
        {/* face: brows, eyes, nose, mouth, cheeks */}
        <path d="M24.300 25.300q2.700-1.600 5.200-.4M34.500 24.900q2.500-1.200 5.200.4" fill="none" stroke={L.brow} strokeWidth="1.200" strokeLinecap="round" />
        <ellipse cx="27.200" cy="28.300" rx="1.500" ry="1.150" fill="#2a1a14" /><ellipse cx="36.800" cy="28.300" rx="1.500" ry="1.150" fill="#2a1a14" />
        <circle cx="27.600" cy="27.900" r="0.4" fill="#fff" /><circle cx="37.200" cy="27.900" r="0.4" fill="#fff" />
        <path d="M32 29.500c-1.300 2.800-1.700 3.700-.4 4.500.6.300 1.600.3 2.200-.1" fill="none" stroke={shade} strokeWidth="1" strokeLinecap="round" />
        <path d="M28.600 36.200q3.400 2.600 6.800 0" fill="none" stroke="#8a3f3f" strokeWidth="1.200" strokeLinecap="round" />
        <circle cx="24.500" cy="33" r="2.600" fill="#e77" opacity="0.14" /><circle cx="39.500" cy="33" r="2.600" fill="#e77" opacity="0.14" />
        {k === 4 ? <g fill="none" stroke="#1d1d22" strokeWidth="1.200"><rect x="23.400" y="25.600" width="7.600" height="5.400" rx="2.300" /><rect x="33" y="25.600" width="7.600" height="5.400" rx="2.300" /><path d="M31 27.800h2" /></g> : null}
        {k === 4 ? <path d="M23 34c1 7 5 9.500 9 9.500s8-2.500 9-9.500c-1.500 3-4.500 4.200-9 4.200S24.500 37 23 34z" fill={L.hair[1]} opacity="0.55" /> : null}
        </g>
      </svg>
    </span>
  )
}
