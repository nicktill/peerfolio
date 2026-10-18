import { Layers, MousePointer2, Ticket, LockKeyhole } from "lucide-react"

/** The empty ticket reserves the same space as the editor on desktop. */
export function SlipEmpty({ parlay = false, min = 2, max = 6 }: { parlay?: boolean; min?: number; max?: number }) {
  return <div className="sp-slip-welcome" data-parlay={parlay || undefined}>
    <div className="sp-ticket-art" aria-hidden><span /><Ticket /><i>{parlay ? <Layers /> : <MousePointer2 />}</i></div>
    <span className="sp-ticket-eyebrow">Your game. Your call.</span>
    <h3>{parlay ? "A few picks. One ticket." : "See a line you like?"}</h3>
    <p>{parlay ? `Choose ${min}–${max} legs from different upcoming games. Your combined odds come together here.` : "Choose an outcome from the game cards. Your selection, stake and potential win come together here."}</p>
    <ol className="sp-ticket-steps" aria-label="How to build a pick"><li><b>1</b>Pick a {parlay ? "few lines" : "line"}</li><li><b>2</b>Set your stake</li><li><b>3</b>Lock it in</li></ol>
    <small><LockKeyhole aria-hidden /> Play cash only · no real money</small>
  </div>
}
