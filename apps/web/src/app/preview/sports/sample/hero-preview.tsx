"use client"

import { useState } from 'react'
import { ModeSwitch, type FantasyMode } from '@web/components/sports/mode-switch'
import { SportsAccessProvider } from '@web/components/sports/use-sports-enabled'

/** Preview-only, with sample feed labels; no writes or real quote requests. */
export function HeroPreview() {
  const [mode,setMode]=useState<FantasyMode>('sports')
  return <SportsAccessProvider enabled={true}><div className="fw fw-home mb-5"><ModeSwitch mode={mode} onChange={setMode}/></div></SportsAccessProvider>
}
