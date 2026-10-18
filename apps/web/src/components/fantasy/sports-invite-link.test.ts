import assert from "node:assert/strict"
import test from "node:test"
import { sportsInviteLink } from "./sports-invite-link.ts"

test("builds the join link from origin and code", () => {
  assert.equal(sportsInviteLink("https://www.peerfolio.org/", " bpvht29m "), "https://www.peerfolio.org/join/sports/BPVHT29M")
  assert.equal(sportsInviteLink("http://localhost:3000", "a/b"), "http://localhost:3000/join/sports/A%2FB")
})
