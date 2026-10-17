import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGames, scoreboardDays, scoreboardMatch, SCOREBOARD_PATHS } from './scoreboard.ts'
const at='2026-10-17T23:20:00.000Z'
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
