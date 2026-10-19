"use client"

import { EditSportsLeagueButton, type EditableSportsLeague } from "@web/components/sports/edit-sports-league-dialog"

export function EditLeaguePreviewClient({ league }: { league: EditableSportsLeague }) {
  return <div className="fw"><EditSportsLeagueButton league={league} onSaved={() => {}} /></div>
}
