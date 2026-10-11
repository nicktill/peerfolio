import type { ComponentType } from "react"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { PlateBackdrop, type PlateProps } from "@web/components/landing/plate-backdrop"
import { SkyOrbitBackdrop } from "@web/components/landing/sky-orbit-backdrop"

/**
 * Landing hero backdrops, switchable with `?hero=<id>` for A/B looks. To add a single-plate scene: drop the image as
 * public/hero/<id>/plate.{avif,webp}, add a `plate("<id>", "dark" | "light")` line below, and a block for it in
 * landing.css (image, focal point, scrim strength, optional accent). A scene is theme-specific: in the other theme
 * the flat hero shows. `layout` says how the hero sits under the sticky header.
 */
export interface HeroVariant {
  id: string
  Backdrop: ComponentType
  /** "full-bleed": the art runs up behind a transparent header. "flat": the header keeps the page colour. */
  layout: "full-bleed" | "flat"
}

function plate(id: string, theme: "dark" | "light", extra: Partial<Pick<PlateProps, "layer" | "blend" | "art">> = {}): HeroVariant {
  const Backdrop = () => <PlateBackdrop art={extra.art ?? id} theme={theme} layer={extra.layer} blend={extra.blend} />
  Backdrop.displayName = `Hero(${id})`
  return { id, Backdrop, layout: "full-bleed" }
}

export const HERO_VARIANTS: Record<string, HeroVariant> = {
  "sky-orbit": { id: "sky-orbit", Backdrop: SkyOrbitBackdrop, layout: "full-bleed" },
  flat: { id: "flat", Backdrop: HeroBackdrop, layout: "flat" },
  // Dark scenes (show in dark mode; light mode falls back to the flat hero)
  waves: plate("waves", "dark"),
  "waves-2": plate("waves-2", "dark"),
  "earth-night": plate("earth-night", "dark"),
  "earth-night-europe": plate("earth-night-europe", "dark"),
  "night-plain": plate("night-plain", "dark", { layer: "earth-limb" }),
  "grid-tech": plate("grid-tech", "dark", { art: "night-plain", layer: "blue-skyline", blend: "screen" }),
  "green-hall": plate("green-hall", "dark", { layer: "green-crystals" }),
  "green-hall-bars": plate("green-hall-bars", "dark", { layer: "green-bars" }),
  "green-hall-bars-2": plate("green-hall-bars-2", "dark"),
  // Light scenes (show in light mode; dark mode falls back to the flat hero)
  "glass-sky": plate("glass-sky", "light", { layer: "ice-shards" }),
  "ice-peaks": plate("ice-peaks", "light", { layer: "ice-crystals" }),
  "blue-haze": plate("blue-haze", "light"),
  "blue-mountains-haze": plate("blue-mountains-haze", "light", { layer: "ice-crystals" }),
  bubbles: plate("bubbles", "light", { layer: "bubbles" }),
  "lavender-bubbles": plate("lavender-bubbles", "light", { layer: "bubbles-2" }),
  "aura-light": plate("aura-light", "light"),
  "silk-light": plate("silk-light", "light"),
}

export const DEFAULT_HERO = "sky-orbit"

export function resolveHero(param: string | string[] | undefined): HeroVariant {
  const key = Array.isArray(param) ? param[0] : param
  return key && Object.prototype.hasOwnProperty.call(HERO_VARIANTS, key) ? HERO_VARIANTS[key] : HERO_VARIANTS[DEFAULT_HERO]
}
