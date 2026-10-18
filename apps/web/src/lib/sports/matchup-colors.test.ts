import test from 'node:test'
import assert from 'node:assert/strict'
import { matchupColors, matchupSelectionColor, marketSelectionColor } from './matchup-colors.ts'
test('similar black/gold NHL teams receive distinct visible accents',()=>{
 const colors=matchupColors('nhl','Pittsburgh Penguins','Vegas Golden Knights')
 assert.notEqual(colors[0],colors[1]);assert.notEqual(colors[0],'#000000');assert.notEqual(colors[1],'#000000')
 assert.deepEqual(colors,matchupColors('nhl','Pittsburgh Penguins','Vegas Golden Knights'))
})
test('unknown teams retain two distinguishable accents',()=>{
 const [a,b]=matchupColors('nhl','Unknown A','Unknown B');assert.notEqual(a,b)
})

test('UTSA ticket uses the orange card accent rather than its primary navy',()=>{
 const event={sport:'cfb',away:'Navy Midshipmen',home:'UTSA Roadrunners'}
 const [away,home]=matchupColors(event.sport,event.away,event.home)
 assert.equal(matchupSelectionColor(event,'home'),home)
 assert.equal(matchupSelectionColor(event,'away'),away)
 assert.equal(home,'#f15a22')
})
test('tennis ticket follows the first-player orientation; totals have no team accent',()=>{
 const event={sport:'tennis',home:'Player A',away:'Player B'}
 const colors=matchupColors(event.sport,event.home,event.away)
 assert.equal(matchupSelectionColor(event,'home'),colors[0])
 assert.equal(matchupSelectionColor(event,'away'),colors[1])
 assert.equal(matchupSelectionColor(event,'over'),null)
})

test('spread cards and ticket share their team accent; totals use non-team accents',()=>{
 const event={sport:'mls',away:'Vancouver Whitecaps',home:'Austin FC'}
 assert.equal(marketSelectionColor(event,'spread','home'),matchupSelectionColor(event,'home'))
 assert.notEqual(marketSelectionColor(event,'total','over'),marketSelectionColor(event,'total','under'))
 assert.equal(marketSelectionColor(event,'moneyline','draw'),'#8b9caa')
})
