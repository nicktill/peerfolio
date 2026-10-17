import test from 'node:test'
import assert from 'node:assert/strict'
import { matchupColors } from './matchup-colors.ts'
test('similar black/gold NHL teams receive distinct visible accents',()=>{
 const colors=matchupColors('nhl','Pittsburgh Penguins','Vegas Golden Knights')
 assert.notEqual(colors[0],colors[1]);assert.notEqual(colors[0],'#000000');assert.notEqual(colors[1],'#000000')
 assert.deepEqual(colors,matchupColors('nhl','Pittsburgh Penguins','Vegas Golden Knights'))
})
test('unknown teams retain two distinguishable accents',()=>{
 const [a,b]=matchupColors('nhl','Unknown A','Unknown B');assert.notEqual(a,b)
})
