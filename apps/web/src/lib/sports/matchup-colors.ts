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
