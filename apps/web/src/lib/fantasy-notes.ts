import "server-only"
import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import {
  db,
  fantasyDraftPicks,
  fantasyMembers,
  fantasyNoteReactions,
  fantasyNoteReplies,
  fantasyNotes,
  fantasyOrders,
  fantasyTrades,
  users,
} from "@web/db"
import { ApiError } from "@web/lib/api"
import { cleanNote } from "@web/lib/fantasy-season"
import { requireFantasyMember } from "@web/lib/fantasy"
import { isReactionEmoji } from "@web/lib/social"

/**
 * "Why I picked this": a short note on a trade or a draft pick, which the rest
 * of the league can react to (the same emoji as standings) and reply to.
 */

/** Most replies one note takes, so a thread can't grow without bound. */
const MAX_REPLIES = 50

export type NoteAuthor = { userId: string; name: string | null; handle: string | null; image: string | null }
export type NoteView = {
  id: string
  body: string
  at: string
  author: NoteAuthor
  isYours: boolean
  reactions: { emoji: string; count: number; mine: boolean }[]
  replies: { id: string; body: string; at: string; author: NoteAuthor; isYours: boolean }[]
}

/** Notes for the given trades and picks, keyed `trade:<id>` or `pick:<id>`. */
export async function loadNotesFor(targets: { tradeIds?: string[]; pickIds?: string[] }, viewerUserId: string): Promise<Map<string, NoteView>> {
  const out = new Map<string, NoteView>()
  const tradeIds = targets.tradeIds ?? []
  const pickIds = targets.pickIds ?? []
  if (tradeIds.length === 0 && pickIds.length === 0) return out

  const author = { userId: users.id, name: users.name, handle: users.handle, image: users.image }
  // A note written with an order that waited for the open belongs to the trade the order became.
  const filled = tradeIds.length
    ? await db.select({ id: fantasyOrders.id, tradeId: fantasyOrders.tradeId }).from(fantasyOrders).where(inArray(fantasyOrders.tradeId, tradeIds))
    : []
  const tradeOfOrder = new Map(filled.map((o) => [o.id, o.tradeId as string]))
  const notes = await db
    .select({ id: fantasyNotes.id, body: fantasyNotes.body, at: fantasyNotes.createdAt, tradeId: fantasyNotes.tradeId, orderId: fantasyNotes.orderId, pickId: fantasyNotes.pickId, ...author })
    .from(fantasyNotes)
    .innerJoin(fantasyMembers, eq(fantasyNotes.memberId, fantasyMembers.id))
    .innerJoin(users, eq(fantasyMembers.userId, users.id))
    .where(
      or(
        tradeIds.length ? inArray(fantasyNotes.tradeId, tradeIds) : undefined,
        pickIds.length ? inArray(fantasyNotes.pickId, pickIds) : undefined,
        filled.length ? inArray(fantasyNotes.orderId, filled.map((o) => o.id)) : undefined,
      ),
    )
  if (notes.length === 0) return out
  const noteIds = notes.map((x) => x.id)

  const [reactions, replies] = await Promise.all([
    db
      .select({ noteId: fantasyNoteReactions.noteId, emoji: fantasyNoteReactions.emoji, userId: fantasyMembers.userId })
      .from(fantasyNoteReactions)
      .innerJoin(fantasyMembers, eq(fantasyNoteReactions.memberId, fantasyMembers.id))
      .where(inArray(fantasyNoteReactions.noteId, noteIds)),
    db
      .select({ id: fantasyNoteReplies.id, noteId: fantasyNoteReplies.noteId, body: fantasyNoteReplies.body, at: fantasyNoteReplies.createdAt, ...author })
      .from(fantasyNoteReplies)
      .innerJoin(fantasyMembers, eq(fantasyNoteReplies.memberId, fantasyMembers.id))
      .innerJoin(users, eq(fantasyMembers.userId, users.id))
      .where(inArray(fantasyNoteReplies.noteId, noteIds))
      .orderBy(asc(fantasyNoteReplies.createdAt)),
  ])

  for (const note of notes) {
    const mine = reactions.filter((r) => r.noteId === note.id)
    const counts = new Map<string, { count: number; mine: boolean }>()
    for (const r of mine) {
      const c = counts.get(r.emoji) ?? { count: 0, mine: false }
      c.count++
      if (r.userId === viewerUserId) c.mine = true
      counts.set(r.emoji, c)
    }
    const tradeId = note.tradeId ?? (note.orderId ? tradeOfOrder.get(note.orderId) : undefined)
    out.set(tradeId ? `trade:${tradeId}` : `pick:${note.pickId}`, {
      id: note.id,
      body: note.body,
      at: note.at.toISOString(),
      author: { userId: note.userId, name: note.name, handle: note.handle, image: note.image },
      isYours: note.userId === viewerUserId,
      reactions: [...counts.entries()].map(([emoji, v]) => ({ emoji, ...v })),
      replies: replies
        .filter((r) => r.noteId === note.id)
        .map((r) => ({ id: r.id, body: r.body, at: r.at.toISOString(), author: { userId: r.userId, name: r.name, handle: r.handle, image: r.image }, isYours: r.userId === viewerUserId })),
    })
  }
  return out
}

/** Writes or replaces the author's note on one of their own trades or picks. */
export async function saveNote(userId: string, leagueId: string, target: { tradeId?: string; pickId?: string }, text: unknown) {
  const { member } = await requireFantasyMember(userId, leagueId)
  const body = cleanNote(text)
  if (!body) throw new ApiError("Write a few words first")
  const isId = (v: string | undefined) => !!v && /^[0-9a-f-]{36}$/i.test(v)

  if (isId(target.tradeId)) {
    const trade = await db.query.fantasyTrades.findFirst({ where: and(eq(fantasyTrades.id, target.tradeId!), eq(fantasyTrades.leagueId, leagueId)) })
    if (!trade) throw new ApiError("Trade not found", 404)
    if (trade.memberId !== member.id) throw new ApiError("You can only explain your own trades", 403)
    const [row] = await db
      .insert(fantasyNotes)
      .values({ leagueId, memberId: member.id, tradeId: trade.id, body })
      .onConflictDoUpdate({ target: fantasyNotes.tradeId, set: { body } })
      .returning({ id: fantasyNotes.id })
    return { id: row!.id }
  }
  if (isId(target.pickId)) {
    const [pick] = await db
      .select({ id: fantasyDraftPicks.id, memberId: fantasyDraftPicks.memberId })
      .from(fantasyDraftPicks)
      .innerJoin(fantasyMembers, eq(fantasyDraftPicks.memberId, fantasyMembers.id))
      .where(and(eq(fantasyDraftPicks.id, target.pickId!), eq(fantasyMembers.leagueId, leagueId)))
    if (!pick) throw new ApiError("Pick not found", 404)
    if (pick.memberId !== member.id) throw new ApiError("You can only explain your own picks", 403)
    const [row] = await db
      .insert(fantasyNotes)
      .values({ leagueId, memberId: member.id, pickId: pick.id, body })
      .onConflictDoUpdate({ target: fantasyNotes.pickId, set: { body } })
      .returning({ id: fantasyNotes.id })
    return { id: row!.id }
  }
  throw new ApiError("Say which trade or pick this is for")
}

/** A note written with an order that waits for the open. It follows the order to its trade when it fills. */
export async function saveOrderNote(memberId: string, leagueId: string, orderId: string, text: unknown) {
  const body = cleanNote(text)
  if (!body) return
  await db.insert(fantasyNotes).values({ leagueId, memberId, orderId, body }).onConflictDoNothing()
}

/** A note written with a trade that filled straight away. */
export async function saveTradeNote(memberId: string, leagueId: string, tradeId: string, text: unknown) {
  const body = cleanNote(text)
  if (!body) return
  await db.insert(fantasyNotes).values({ leagueId, memberId, tradeId, body }).onConflictDoNothing()
}

async function requireNote(leagueId: string, noteId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(noteId)) throw new ApiError("Note not found", 404)
  const note = await db.query.fantasyNotes.findFirst({ where: and(eq(fantasyNotes.id, noteId), eq(fantasyNotes.leagueId, leagueId)) })
  if (!note) throw new ApiError("Note not found", 404)
  return note
}

export async function addReply(userId: string, leagueId: string, noteId: string, text: unknown) {
  const { member } = await requireFantasyMember(userId, leagueId)
  const note = await requireNote(leagueId, noteId)
  const body = cleanNote(text)
  if (!body) throw new ApiError("Write a reply first")
  const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(fantasyNoteReplies).where(eq(fantasyNoteReplies.noteId, note.id))) as [{ count: number }]
  if (count >= MAX_REPLIES) throw new ApiError("This thread is full", 409)
  const [row] = await db.insert(fantasyNoteReplies).values({ noteId: note.id, memberId: member.id, body }).returning({ id: fantasyNoteReplies.id })
  return { id: row!.id }
}

/** Toggles the viewer's emoji on a note. Returns whether it is now on. */
export async function toggleNoteReaction(userId: string, leagueId: string, noteId: string, emoji: string) {
  const { member } = await requireFantasyMember(userId, leagueId)
  if (!isReactionEmoji(emoji)) throw new ApiError("Unsupported reaction")
  const note = await requireNote(leagueId, noteId)
  const inserted = await db.insert(fantasyNoteReactions).values({ noteId: note.id, memberId: member.id, emoji }).onConflictDoNothing().returning({ id: fantasyNoteReactions.id })
  if (inserted.length > 0) return { active: true }
  await db.delete(fantasyNoteReactions).where(and(eq(fantasyNoteReactions.noteId, note.id), eq(fantasyNoteReactions.memberId, member.id), eq(fantasyNoteReactions.emoji, emoji)))
  return { active: false }
}
