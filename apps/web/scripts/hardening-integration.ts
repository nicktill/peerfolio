import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import postgres from 'postgres'
import { and, eq, sql } from 'drizzle-orm'
import { db, users, accounts, portfolioSnapshots, securities, portfolioFlowEvents, portfolioFlowBaselines, importAiSpend, plaidItems, plaidRemovals, backgroundLeases, fantasyLeagues, fantasyMembers, fantasySnapshots, fantasyOrders, fantasyPositions, fantasyTrades, withPortfolioWrite } from '@web/db'
import { PATCH as editAccount } from '@web/app/api/accounts/[id]/route'
import { ensureLivePrice } from '@web/lib/live-quotes'
import { loadFantasyLeague, fillQueuedOrders, checkFantasyIntegrity } from '@web/lib/fantasy'
import { scoredValue } from '@web/lib/fantasy-rules'
import { POST as importAccount } from '@web/app/api/accounts/[id]/positions/import/route'
import { prepareItem, applyPreparedItem } from '@web/lib/plaid-sync'
import { POST as addAccount } from '@web/app/api/accounts/route'
import { writeDailySnapshot, syncUser } from '@web/lib/plaid-sync'
import { acceptsPrice, previousCloseOnUpdate } from '@web/lib/price-write'
import { reserveImport } from '@web/lib/import-budget'
import { importReservationUsd } from '@web/lib/import-ai'
import { claimBackgroundLease } from '@web/lib/background-lease'
import { queuePlaidRemoval, retryPlaidRemovals } from '@web/lib/plaid-removal'
import { getPlaidClient } from '@web/lib/plaid'
import { encrypt } from '@web/lib/crypto'
import { runSnapshotJob } from '@web/lib/snapshot-job'
import { timeWeightedReturn } from '@web/lib/ranges'

async function main() {
const url = process.env.DATABASE_URL!
assert.equal(new URL(url).hostname,'127.0.0.1')
assert.equal(new URL(url).port,process.env.HARDENING_TEST_PORT ?? '55439')
assert.equal(new URL(url).pathname,'/peerfolio_hardening_test')
globalThis.fetch = async () => { throw new Error("External HTTP disabled in integration test") }
const raw = postgres(url,{prepare:false})
for (const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) {
  if (file.startsWith('0014')) {
    const [legacy] = await db.insert(users).values({email:'legacy-local@example.test'}).returning()
    await db.insert(portfolioSnapshots).values({userId:legacy!.id,date:'2026-10-01',totalAssets:'1000',totalLiabilities:'0',netWorth:'1000',investableAssets:'1000',netFlows:'200'})
  }
  await raw.begin(async tx => { for (const statement of readFileSync(`drizzle/${file}`,'utf8').split('--> statement-breakpoint')) if (statement.trim()) await tx.unsafe(statement) })
}
assert.equal((await db.select().from(portfolioFlowBaselines))[0]!.date,'2026-10-01')
assert.equal(Number((await db.select().from(portfolioSnapshots))[0]!.netFlows),200)
console.log('PASS all migrations and legacy baseline cutover without rewriting returns')
const [u] = await db.insert(users).values({email:'hardening-local@example.test', name:'Test'}).returning()
const user = u!.id
process.env.TEST_USER_ID = user
await db.insert(accounts).values({userId:user,source:'manual',name:'Base',type:'investment',category:'investment',currentBalance:'1000'})
const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10)
const today = new Date().toISOString().slice(0,10)
await writeDailySnapshot(user,0,yesterday)
const responses = await Promise.all([100,200].map(balance=>addAccount(new Request('http://localhost/api/accounts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:`Account ${balance}`,balance})}),undefined)))
assert.deepEqual(responses.map(r=>r.status),[201,201])
let point = await db.query.portfolioSnapshots.findFirst({where:and(eq(portfolioSnapshots.userId,user),eq(portfolioSnapshots.date,today))})
assert.equal(Number(point!.netFlows),300)
assert.equal(Number(point!.investableAssets),1300)
console.log('PASS concurrent actual manual-account routes: $300 flow, not $600; request body retries safe')
await assert.rejects(withPortfolioWrite(user,async()=>{
  await db.insert(accounts).values({userId:user,source:'manual',name:'Must roll back',type:'investment',category:'investment',currentBalance:'999'})
  await writeDailySnapshot(user,999)
  throw new Error('injected snapshot/mutation failure')
}))
assert.equal((await db.select().from(accounts).where(eq(accounts.name,'Must roll back'))).length,0)
point = await db.query.portfolioSnapshots.findFirst({where:and(eq(portfolioSnapshots.userId,user),eq(portfolioSnapshots.date,today))})
assert.equal(Number(point!.netFlows),300)
console.log('PASS mutation and snapshot roll back together')
const [other] = await db.insert(users).values({email:'other-local@example.test'}).returning()
const [foreign] = await db.insert(accounts).values({userId:other!.id,source:'manual',name:'Foreign',type:'investment',category:'investment',currentBalance:'100'}).returning()
const denied = await editAccount(new Request('http://localhost/api/accounts/'+foreign!.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({balance:999})}),{params:Promise.resolve({id:foreign!.id})})
assert.equal(denied.status,404)
assert.equal(Number((await db.query.accounts.findFirst({where:eq(accounts.id,foreign!.id)}))!.currentBalance),100)
delete process.env.TEST_USER_ID
assert.equal((await addAccount(new Request('http://localhost/api/accounts',{method:'POST',body:'{}'}),undefined)).status,401)
process.env.TEST_USER_ID=user
console.log('PASS actual mutation routes preserve ownership and signed-out rejection')


await db.insert(securities).values({id:'mkt:TEST',marketTicker:'TEST',closePrice:'10',closePriceAsOf:yesterday,closePriceFinal:true})
async function price(date:string,price:number,final:boolean,printedAt:Date|null=null){return db.update(securities).set({closePrice:String(price),closePriceAsOf:date,closePriceFinal:final,quotePrintedAt:printedAt,previousClose:previousCloseOnUpdate(date)}).where(and(eq(securities.id,'mkt:TEST'),acceptsPrice(date,final,printedAt))).returning()}
assert.equal((await price(today,20,false,new Date())).length,1)
assert.equal((await price(yesterday,11,true)).length,0)
assert.equal((await price(today,19,false,new Date(Date.now()-10000))).length,0)
assert.equal((await price(today,21,true)).length,1)
assert.equal((await price(today,22,false,new Date(Date.now()+10000))).length,0)
assert.equal(Number((await db.query.securities.findFirst({where:eq(securities.id,'mkt:TEST')}))!.previousClose),10)
console.log('PASS atomic price ordering: older date, older print, official-close precedence and previous close')
process.env.FINNHUB_API_KEY='local-not-real'
const noon=new Date('2026-10-06T16:00:00Z')
await db.update(securities).set({closePriceFinal:false,closePriceAsOf:'2026-10-06',quotePrintedAt:new Date(noon.getTime()-3600000),updatedAt:noon}).where(eq(securities.id,'mkt:TEST'))
assert.equal(await ensureLivePrice('TEST',{maxAgeSeconds:60,now:noon}),null)
await db.update(securities).set({quotePrintedAt:new Date(noon.getTime()-30000)}).where(eq(securities.id,'mkt:TEST'))
const fresh=await ensureLivePrice('TEST',{maxAgeSeconds:60,now:noon})
assert.equal(fresh!.printedAt,new Date(noon.getTime()-30000).toISOString())
delete process.env.FINNHUB_API_KEY
console.log('PASS queue/check timestamp cannot make an old fill price fresh; fresh cache retains print timestamp')

const claims=await Promise.all([1,2,3].map(()=>claimBackgroundLease('test-lease',600,180)))
assert.equal(claims.filter(Boolean).length,1)
await db.update(backgroundLeases).set({expiresAt:new Date(Date.now()-1)}).where(eq(backgroundLeases.name,'test-lease'))
assert.equal(await claimBackgroundLease('test-lease',600,180),null)
console.log('PASS concurrent background claims and shared interval throttle')

process.env.IMPORT_AI_MONTHLY_BUDGET_USD=String(importReservationUsd('abc')*1.1)
const spends=await Promise.allSettled([1,2,3].map(()=>reserveImport(user,'abc')))
assert.equal(spends.filter(r=>r.status==='fulfilled').length,1)
assert.equal((await db.select().from(importAiSpend)).length,1)
await db.delete(importAiSpend)
process.env.IMPORT_AI_MONTHLY_BUDGET_USD='100'
const hourly=await Promise.allSettled(Array.from({length:13},()=>reserveImport(user,'abc')))
assert.equal(hourly.filter(r=>r.status==='fulfilled').length,12)
console.log('PASS concurrent monthly cap and rolling per-user hourly limit')

const [pu] = await db.insert(users).values({email:'plaid-local@example.test'}).returning()
const plaidUser=pu!.id
const [item] = await db.insert(plaidItems).values({userId:plaidUser,plaidItemId:'local-item',institutionName:'Local',accessToken:encrypt('local-token')}).returning()
await db.insert(accounts).values({userId:plaidUser,itemId:item!.id,source:'plaid',plaidAccountId:'account-local',name:'Linked',type:'investment',category:'investment',currentBalance:'1000'})
await writeDailySnapshot(plaidUser,0,yesterday)
await db.insert(portfolioFlowBaselines).values({userId:plaidUser,date:yesterday})
const plaid=getPlaidClient()
let accountCalls=0,transactionCalls=0
plaid.accountsGet = async ()=>{accountCalls++; return {data:{accounts:[{account_id:'account-local',name:'Linked',type:'investment',subtype:'brokerage',balances:{current:1100,available:null,iso_currency_code:'USD'}}]}} as never}
plaid.investmentsHoldingsGet=async()=>({data:{holdings:[],securities:[]}} as never)
plaid.investmentsTransactionsGet=async request=>{
 transactionCalls++
 const offset=request.options?.offset??0
 return {data:{total_investment_transactions:501,investment_transactions:Array.from({length:offset===0?500:1},(_,i)=>({investment_transaction_id:String(offset+i),date:today,type:offset===0?'buy':'transfer',amount:offset===0?1:-100}))}} as never
}
const refreshed=await Promise.all([syncUser(plaidUser),syncUser(plaidUser)])
assert.ok(refreshed.every(r=>r.healthy))
const snapshots=await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId,plaidUser)).orderBy(portfolioSnapshots.date)
assert.equal(Number(snapshots.at(-1)!.netFlows),100)
assert.equal((await db.select().from(portfolioFlowEvents).where(eq(portfolioFlowEvents.userId,plaidUser))).length,1)
assert.ok(transactionCalls>=4)
assert.equal(timeWeightedReturn(snapshots.map(s=>({date:s.date,netWorth:Number(s.netWorth),investableAssets:Number(s.investableAssets),netFlows:Number(s.netFlows),isVerified:s.isVerified}))).percent,0)
console.log('PASS concurrent paginated Plaid syncs: deposit counted once and flat market return stays 0%')
const delayed=await prepareItem(item!.id)
await new Promise(resolve=>setTimeout(resolve,10))
await syncUser(plaidUser)
delayed.list![0]!.balances.current=900
await withPortfolioWrite(plaidUser,()=>applyPreparedItem(delayed))
assert.equal(Number((await db.query.accounts.findFirst({where:eq(accounts.plaidAccountId,'account-local')}))!.currentBalance),1100)
console.log('PASS delayed Plaid payload cannot overwrite a newer completed refresh')
const [importUser]=await db.insert(users).values({email:'import-local@example.test'}).returning()
const [importTarget]=await db.insert(accounts).values({userId:importUser!.id,source:'manual',name:'Imported',type:'investment',category:'investment',currentBalance:'0'}).returning()
process.env.TEST_USER_ID=importUser!.id
const importedBody={rows:[{symbol:'66585Y356',kind:'stock',quantity:10,price:30.15}],replace:false}
const importCall=async(body:unknown)=>importAccount(new Request('http://localhost/api/accounts/'+importTarget!.id+'/positions/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:importTarget!.id})})
assert.equal((await importCall(importedBody)).status,200)
assert.equal((await importCall(importedBody)).status,200)
const failedReplace=await importCall({rows:[{symbol:'84679P405',kind:'stock',quantity:10}],replace:true})
assert.equal((await failedReplace.json()).removed,0)
assert.equal(Number((await db.query.accounts.findFirst({where:eq(accounts.id,importTarget!.id)}))!.currentBalance),301.5)
process.env.TEST_USER_ID=user
console.log('PASS actual import route: statement prices, repeated imports and failed replace preserve positions')


const short=await runSnapshotJob({deadline:Date.now()+1})
assert.equal(short.healthy,false)
const resumed=await runSnapshotJob({resumeOnly:true})
assert.equal(resumed.healthy,true)
const calls=accountCalls
const done=await runSnapshotJob({resumeOnly:true})
assert.equal(done.healthy,true)
assert.equal(accountCalls,calls)
console.log('PASS snapshot deadline checkpoint resumes and completed work is not replayed')

await queuePlaidRemoval(item!)
await db.delete(users).where(eq(users.id,plaidUser))
assert.equal((await db.select().from(plaidRemovals)).length,1)
plaid.itemRemove=async()=>{throw new Error('provider unavailable')}
assert.equal((await retryPlaidRemovals()).pending,1)
plaid.itemRemove=async()=>({data:{removed:true}} as never)
assert.equal((await retryPlaidRemovals()).removed,1)
assert.equal((await db.select().from(plaidRemovals)).length,0)
console.log('PASS failed remote removal survives user deletion and erases token on success')
const [league]=await db.insert(fantasyLeagues).values({name:'Frozen',ownerId:user,inviteCode:'local-frozen',startingCash:'100000',endsAt:new Date(Date.now()-2*86400000)}).returning()
const [member]=await db.insert(fantasyMembers).values({leagueId:league!.id,userId:user,cash:'100000'}).returning()
const history=Array.from({length:1200},(_,i)=>({memberId:member!.id,date:new Date(Date.now()-(1200-i)*86400000).toISOString().slice(0,10),value:String(100000+i)}))
for(let offset=0;offset<history.length;offset+=500) await db.insert(fantasySnapshots).values(history.slice(offset,offset+500))
const detail=await loadFantasyLeague(user,league!.id)
const standing=detail.standings[0]!
assert.equal(standing.value,scoredValue(league!.endsAt,history.map(h=>({date:h.date,value:Number(h.value)})),100000))
assert.equal(standing.days,1201)
assert.ok(standing.spark.length<365)
console.log('PASS long fantasy chart is bounded while exact frozen score and day count remain unchanged')
const [trading]=await db.insert(fantasyLeagues).values({name:'Trading',ownerId:user,inviteCode:'local-trading',startingCash:'100000'}).returning()
const [trader]=await db.insert(fantasyMembers).values({leagueId:trading!.id,userId:user,cash:'100000'}).returning()
await db.insert(fantasyOrders).values({leagueId:trading!.id,memberId:trader!.id,securityId:'mkt:TEST',side:'buy',amount:'200',createdAt:new Date(noon.getTime()-60000)})
process.env.FINNHUB_API_KEY='local-not-real'
process.env.QUOTE_PROVIDER='finnhub'
const previousFetch=globalThis.fetch, previousNow=Date.now
try {
  Date.now=()=>noon.getTime()
  globalThis.fetch=async input=>{
    assert.ok(String(input).startsWith('https://finnhub.io/api/v1/quote'))
    return new Response(JSON.stringify({c:25,t:Math.floor(noon.getTime()/1000)}),{status:200})
  }
  const fills=await Promise.all([fillQueuedOrders({now:noon}),fillQueuedOrders({now:noon})])
  assert.equal(fills.reduce((sum,f)=>sum+f.filled,0),1)
} finally { globalThis.fetch=previousFetch; Date.now=previousNow; delete process.env.FINNHUB_API_KEY }
assert.equal((await db.select().from(fantasyTrades).where(eq(fantasyTrades.memberId,trader!.id))).length,1)
assert.equal(Number((await db.query.fantasyMembers.findFirst({where:eq(fantasyMembers.id,trader!.id)}))!.cash),99800)
assert.equal(Number((await db.query.fantasyPositions.findFirst({where:eq(fantasyPositions.memberId,trader!.id)}))!.shares),8)
const integrity=await checkFantasyIntegrity(noon,[trader!.id])
assert.deepEqual(integrity.mismatches,[])
assert.deepEqual(integrity.badPrices,[])
console.log('PASS simultaneous queued fills execute once with exact cash/shares and a clean full-ledger audit')


await raw.end()
await (globalThis.__peerfolioDb as unknown as {$client:postgres.Sql}).$client.end()

}
main().catch(error=>{console.error(error);process.exit(1)})
