import assert from "node:assert/strict"
import test from "node:test"
import { inviteMetadata } from "./invite-metadata.ts"

for (const kind of ["league", "fantasy"] as const) {
  test(`${kind} invitations override the homepage preview and retain their destination`, () => {
    const result = inviteMetadata(kind, " ab12cd ")
    assert.match(String(result.title), /You've been invited/)
    assert.equal(result.openGraph?.url, `${kind === "fantasy" ? "/fantasy" : ""}/join/AB12CD`)
    assert.equal(result.openGraph?.title, result.title)
    assert.equal(result.twitter?.title, result.title)
    assert.equal(result.twitter?.description, result.description)
    assert.deepEqual(result.openGraph?.images, [{ url: `/invite-preview/${kind}`, width: 1200, height: 630, alt: `${result.title} on Peerfolio` }])
    assert.deepEqual(result.twitter?.images, result.openGraph?.images)
    assert.deepEqual(result.robots, { index: false, follow: false })
    assert.ok(!JSON.stringify(result.openGraph?.images).includes("AB12CD"))
  })
}

test("invite codes cannot alter the preview URL path", () => {
  assert.equal(inviteMetadata("league", "a/b?#").openGraph?.url, "/join/A%2FB%3F%23")
})
