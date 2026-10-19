import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeLiveScores, normalizeGames, scoreboardDays, scoreboardMatch, SCOREBOARD_PATHS } from './scoreboard.ts'
const at='2026-10-17T23:20:00.000Z'

test('last play is concise, optional and only shown for live games', () => {
 const c = { ...competition('in'), situation: { lastPlay: { text: '  Smith   pass to Jones for 12 yards.  ' } } }
 assert.equal(normalizeGames(board(c), 'nfl', at)[0]?.lastPlay, 'Smith pass to Jones for 12 yards.')
 assert.equal(normalizeGames(board({ ...c, status: { type: { state: 'post', completed: true } } }), 'nfl', at)[0]?.lastPlay, undefined)
 assert.equal(normalizeGames(board(competition('in')), 'nfl', at)[0]?.lastPlay, undefined)
})

test('fast scores overlay live games and finals without replacing newer or upcoming data', () => {
 const live = normalizeGames(board(competition('in')), 'nfl', at)[0]!
 const next = { ...live, fetchedAt: new Date(Date.parse(at) + 10000).toISOString(), homeScore: '28' }
 const upcoming = { ...live, id: 'upcoming', status: 'upcoming' as const }
 assert.equal(mergeLiveScores([live], [next])[0]?.homeScore, '28')
 assert.equal(mergeLiveScores([next], [live])[0]?.homeScore, '28')
 assert.equal(mergeLiveScores([live], [{ ...next, status: 'final' }])[0]?.status, 'final')
 assert.equal(mergeLiveScores([upcoming], [{ ...upcoming, fetchedAt: next.fetchedAt, homeRecord: 'new' }])[0]?.homeRecord, upcoming.homeRecord)
 assert.equal(mergeLiveScores([upcoming], [{ ...next, id: 'upcoming' }])[0]?.status, 'live')
})
const competition=(state='in', name='STATUS_IN_PROGRESS') => ({ id:'123', date:'2026-10-17T23:00:00Z', status:{ type:{state,name,shortDetail:'12:34 - 1st'} }, competitors:[
 {homeAway:'home',team:{displayName:'Philadelphia Flyers'},score:'0',records:[{type:'total',summary:'0-6-3'},{type:'home',summary:'0-2-0'}]},
 {homeAway:'away',team:{displayName:'Ottawa Senators'},score:'2',records:[{type:'total',summary:'6-2-0'}]},
] })
const board=(c:unknown) => ({ events:[{ competitions:[c] }] })
test('an unpriced ongoing game is visible without markets or a stored event',()=>{
 const [g]=normalizeGames(board(competition()),'nhl',at)
 assert.equal(g?.status,'live');assert.equal(g.homeScore,'0');assert.equal(g.awayScore,'2')
 assert.equal(g.homeRecord,'0-6-3');assert.equal(g.awayRecord,'6-2-0')
})
test('scheduled games never invent zero scores; final games are not live',()=>{
 assert.equal(normalizeGames(board(competition('pre')),'nhl',at)[0]?.homeScore,null)
 assert.equal(normalizeGames(board(competition('post','STATUS_FINAL')),'nhl',at)[0]?.status,'final')
})
test('rain delays and suspended games already underway remain visible; cancellations do not',()=>{
 assert.equal(normalizeGames(board(competition('in','STATUS_RAIN_DELAY')),'mlb',at)[0]?.status,'live')
 assert.equal(normalizeGames(board(competition('in','STATUS_SUSPENDED')),'mlb',at)[0]?.status,'live')
 assert.equal(normalizeGames(board(competition('pre','STATUS_POSTPONED')),'mlb',at)[0]?.status,'unavailable')
})
test('tennis covers both tours, orders athletes and only counts completed sets',()=>{
 assert.deepEqual(SCOREBOARD_PATHS.tennis,['tennis/atp','tennis/wta'])
 const raw={events:[{groupings:[{competitions:[{id:'t',date:at,status:{type:{state:'in'}},competitors:[
 {order:2,athlete:{displayName:'Player B'},linescores:[{value:4},{value:3}]},
 {order:1,athlete:{displayName:'Player A'},linescores:[{value:6},{value:4}]},
 ]}]}]}]}
 const [g]=normalizeGames(raw,'tennis',at)
 assert.equal(g?.home,'Player A');assert.equal(g.homeScore,'1');assert.equal(g.awayScore,'0')
})
const tcomp=(state:string,a:unknown[],b:unknown[],extra:object={})=>({events:[{groupings:[{competitions:[{id:'m',date:at,status:{type:{state}},competitors:[
 {order:1,athlete:{displayName:'Player A'},linescores:a},{order:2,athlete:{displayName:'Player B'},linescores:b}],...extra}]}]}]})
test('tennis keeps per-set games and tiebreaks from real ESPN payload fragments',()=>{
 // Finished 3-setter with tiebreaks (ESPN: tiebreak only on tied-at-6 sets, per player)
 const [f]=normalizeGames(tcomp('post',[{value:3,winner:false},{value:7,tiebreak:7,winner:true},{value:6,winner:false}],[{value:6,winner:true},{value:6,tiebreak:1,winner:false},{value:7,winner:true}]),'tennis',at)
 assert.deepEqual(f!.homeSets,[{games:3},{games:7,tiebreak:7},{games:6}])
 assert.deepEqual(f!.awaySets,[{games:6},{games:6,tiebreak:1},{games:7}])
 assert.equal(f!.homeScore,'1');assert.equal(f!.awayScore,'2')
 // Live: current set has no winner flag
 const [l]=normalizeGames(tcomp('in',[{value:6,winner:true},{value:0}],[{value:2,winner:false},{value:0}]),'tennis',at)
 assert.deepEqual(l!.homeSets,[{games:6},{games:0}]);assert.equal(l!.status,'live')
})
test('tennis without set data (walkover, not started, malformed) has no set arrays',()=>{
 for(const [state,a,b] of [['post',undefined,undefined],['pre',[],[]],['in',[{value:6}],[]],['in',[{value:null}],[{value:2}]]] as [string, unknown, unknown][]){
  const [g]=normalizeGames(tcomp(state,a as unknown[],b as unknown[]),'tennis',at)
  assert.equal(g!.homeSets,undefined);assert.equal(g!.awaySets,undefined)
 }
 const [r]=normalizeGames(tcomp('post',[{value:6,winner:true},{value:4,winner:false}],[{value:4,winner:false},{value:1,winner:false}]),'tennis',at)
 assert.equal(r!.homeScore,'1');assert.equal(r!.awayScore,'0');assert.equal(r!.homeSets!.length,2)
})
test('non-tennis games never carry set arrays',()=>{
 assert.equal(normalizeGames(board(competition()),'nhl',at)[0]!.homeSets,undefined)
})
test('scoreboard matching requires same orientation, sport and start window',()=>{
 const [g]=normalizeGames(board(competition()),'nhl',at)
 assert.ok(scoreboardMatch({...g!},[g!]))
 assert.equal(scoreboardMatch({...g!,sport:'mlb'},[g!]),undefined)
 assert.equal(scoreboardMatch({...g!,startsAt:'2026-10-18T23:00:00Z'},[g!]),undefined)
})
test('Eastern scoreboard window spans UTC midnight and DST transitions',()=>{
 assert.deepEqual(scoreboardDays(new Date('2026-10-18T01:00:00Z')),['20261016','20261017','20261018'])
 assert.ok(scoreboardDays(new Date('2026-11-01T06:30:00Z')).includes('20261101'))
})
test('malformed metadata cannot create a phantom live game',()=>{
 assert.deepEqual(normalizeGames({events:[null,{competitions:[{},competition()]}]},'nhl',at).map(g=>g.id),['123'])
 assert.deepEqual(normalizeGames(null,'nhl',at),[])
})

test('scoreboard days run from yesterday through three days ahead, one request per day', () => {
 assert.deepEqual(scoreboardDays(new Date('2026-10-17T23:20:00Z'), 3), ['20261016', '20261017', '20261018', '20261019', '20261020'])
})
// Fragment captured from site.api.espn.com soccer/usa.1 at halftime (links/logos removed).
const espnSoccerLive = { odds: [{ details: 'VAN -200', moneyline: { displayName: 'Moneyline',
  home: { open: { odds: '+360' }, close: { odds: '+425' }, current: { odds: '+145' } },
  away: { open: { odds: '-170' }, close: { odds: '-200' }, current: { odds: '+210' } },
  draw: { open: { odds: '+320' }, close: { odds: '+350' }, current: { odds: '+210' } } } }] }
test('ESPN in-game moneyline becomes a vig-free view-only probability, draw included for soccer',()=>{
 const [g] = normalizeGames(board({ ...competition('in'), ...espnSoccerLive }),'mls',at)
 assert.equal(g?.probSource,'espn')
 assert.ok(Math.abs(g.homeWinProb! + g.awayWinProb! + g.drawProb! - 1) < 1e-9)
 assert.ok(Math.abs(g.homeWinProb! - 0.387) < 0.002 && Math.abs(g.awayWinProb! - 0.306) < 0.002)
})
test('two-way odds normalise; pre-game close prices, missing, insane or non-live odds give no probability',()=>{
 const two = { odds: [{ moneyline: { home: { current: { odds: '-150' } }, away: { current: { odds: '+130' } } } }] }
 const [g] = normalizeGames(board({ ...competition('in'), ...two }),'nba',at)
 assert.ok(Math.abs(g!.homeWinProb! + g!.awayWinProb! - 1) < 1e-9 && g!.homeWinProb! > 0.55 && g!.drawProb === undefined)
 const closeOnly = { odds: [{ moneyline: { home: { close: { odds: '-150' } }, away: { close: { odds: '+130' } } } }] }
 assert.equal(normalizeGames(board({ ...competition('in'), ...closeOnly }),'nba',at)[0]?.homeWinProb, undefined)
 assert.equal(normalizeGames(board(competition('in')),'nba',at)[0]?.homeWinProb, undefined)
 const insane = { odds: [{ moneyline: { home: { current: { odds: '-500' } }, away: { current: { odds: '-500' } } } }] }
 assert.equal(normalizeGames(board({ ...competition('in'), ...insane }),'nba',at)[0]?.homeWinProb, undefined)
 assert.equal(normalizeGames(board({ ...competition('pre'), ...two }),'nba',at)[0]?.homeWinProb, undefined)
 assert.equal(normalizeGames(board({ ...competition('in'), ...two }),'mls',at)[0]?.homeWinProb, undefined)
})

test("pregameWinProbs reads the latest pregame moneyline, removes the vig, and rejects nonsense", async () => {
  const { pregameWinProbs } = await import("./scoreboard.ts")
  const good = { odds: [{ moneyline: { home: { close: { odds: "-185" }, open: { odds: "-160" } }, away: { close: { odds: "+155" }, open: { odds: "+135" } } } }] }
  const p = pregameWinProbs(good, false)!
  assert.ok(p.home > 0.6 && p.home < 0.7, `home ${p.home}`)
  assert.ok(Math.abs(p.home + p.away - 1) < 1e-9)
  // current beats close when present
  const moved = { odds: [{ moneyline: { home: { current: { odds: "+100" }, close: { odds: "-185" } }, away: { current: { odds: "-120" }, close: { odds: "+155" } } } }] }
  assert.ok(pregameWinProbs(moved, false)!.home < 0.5)
  assert.equal(pregameWinProbs({ odds: [{ moneyline: { home: { close: { odds: "-110" } } } }] }, false), null)
  assert.equal(pregameWinProbs({ odds: [{ moneyline: { home: { close: { odds: "-900" } }, away: { close: { odds: "-900" } } } }] }, false), null)
  assert.equal(pregameWinProbs({}, false), null)
})


test('soccer reads the latest meaningful event from details, independently of array order', () => {
 const c = { ...competition('in'), details: [
  { type: { text: 'Goal' }, clock: { value: 3359, displayValue: "56'" }, athletesInvolved: [{ displayName: 'Martín Satriano' }], team: { id: 'getafe' } },
  { type: { text: 'Yellow card' }, clock: { value: 1200, displayValue: "20'" } },
 ], competitors: competition('in').competitors.map((x, i) => ({ ...x, team: { ...x.team, id: i === 0 ? 'getafe' : 'rayo', displayName: i === 0 ? 'Getafe' : 'Rayo Vallecano' } })) }
 assert.equal(normalizeGames(board(c), 'laliga', at)[0]?.lastPlay, "56' · Goal · Martín Satriano · Getafe")
 assert.equal(normalizeGames(board({ ...c, status: { type: { state: 'post', completed: true } } }), 'laliga', at)[0]?.lastPlay, undefined)
 assert.equal(normalizeGames(board(c), 'nfl', at)[0]?.lastPlay, undefined)
})

test('missing soccer commentary is absent rather than a fabricated waiting message', () => {
 const c = { ...competition('in'), details: [{ type: {}, clock: { value: 'invalid' } }] }
 assert.equal(normalizeGames(board(c), 'epl', at)[0]?.lastPlay, undefined)
})
