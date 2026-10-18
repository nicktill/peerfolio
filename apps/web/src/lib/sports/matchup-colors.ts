import { teamLook } from './teams.ts'
const rgb = (hex: string) => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16))
const distance = (a: string, b: string) => Math.sqrt(rgb(a).reduce((sum,v,i) => sum + (v-rgb(b)[i]!)**2,0))
const visible = (hex: string) => rgb(hex).some(v => v >= 110)
/** Deterministic colors across the bar and buttons; identity remains in the actual team logo. */
export function matchupColors(sport: string, first: string, second: string): [string,string] {
 const a=teamLook(sport,first), b=teamLook(sport,second)
 const candidates=(primary:string, alt?:string) => [primary,alt].filter((v):v is string => !!v && /^#[\da-f]{6}$/i.test(v) && visible(v))
 const left=candidates(a.color,a.alternate)[0] ?? '#8b9caa'
 const right=candidates(b.color,b.alternate).find(c => distance(left,c)>100) ?? ['#ae9fd0','#6ebeb5','#d9b966'].sort((x,y)=>distance(left,y)-distance(left,x))[0]!
 return [left,right]
}

/** The selected card and its ticket share the same matchup-adjusted accent. */
export function matchupSelectionColor(event: { sport: string; home: string; away: string }, selection: string): string | null {
 if (selection !== "home" && selection !== "away") return null
 const tennis = event.sport === "tennis"
 const colors = matchupColors(event.sport, tennis ? event.home : event.away, tennis ? event.away : event.home)
 return colors[selection === (tennis ? "home" : "away") ? 0 : 1]
}

const SPORT_ACCENT: Record<string,string> = { nfl: '#c8102e', nba: '#f58426', tennis: '#9cab58', nhl: '#438ec0', mlb: '#bf0d3e', cfb: '#9a85c5', mls: '#379c87', epl: '#8f4fd1', laliga: '#e8a23a', ucl: '#3b7fd9', wnba: '#f1592a', ncaab: '#7a8fd1' }
/** Totals/props are not team picks: distinguish over/under with sport and neutral accents. */
export function marketSelectionColor(event: {sport:string;home:string;away:string}, kind:string, selection:string): string {
 if (kind === 'moneyline' || kind === 'spread') return matchupSelectionColor(event,selection) ?? '#8b9caa'
 return selection === 'over' ? SPORT_ACCENT[event.sport] ?? '#8b9caa' : '#8b9caa'
}
