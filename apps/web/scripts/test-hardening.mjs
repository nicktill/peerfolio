/** Disposable local Postgres only. No .env files or external provider calls. */
import { build } from "esbuild"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
const name = `peerfolio-hardening-${process.pid}`
const temp = mkdtempSync(path.join(tmpdir(), "peerfolio-hardening-"))
let started = false
try {
  execFileSync("docker", ["run", "-d", "--rm", "--name", name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_DB=peerfolio_hardening_test", "-p", "127.0.0.1::5432", "postgres:16-alpine"], { stdio: "pipe" })
  started = true
  let ready = false
  for (let attempt = 0; attempt < 30; attempt++) {
    const check = spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], { stdio: "pipe" })
    if (check.status === 0) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error("Disposable Postgres did not become ready")
  const port = execFileSync("docker", ["port", name, "5432/tcp"], { encoding: "utf8" }).trim().split(":").at(-1)
  writeFileSync(path.join(temp,"auth.ts"), "export const getCurrentUserId = async () => process.env.TEST_USER_ID")
  writeFileSync(path.join(temp,"server.ts"), "export {}")
  const outfile = path.join(temp, "tests.cjs")
  await build({ entryPoints: ["scripts/hardening-integration.ts"], outfile, bundle:true, platform:"node",format:"cjs",packages:"external",tsconfig:"tsconfig.json", alias:{"server-only":path.join(temp,"server.ts"),"@web/lib/auth":path.join(temp,"auth.ts")} })
  const result = spawnSync(process.execPath, [outfile], { stdio:"inherit", env:{...process.env,
    DATABASE_URL:`postgres://postgres@127.0.0.1:${port}/peerfolio_hardening_test`, HARDENING_TEST_PORT:port,
    NODE_PATH:[path.resolve("node_modules"),path.resolve("../../node_modules")].join(path.delimiter),
    PLAID_CLIENT_ID:"local", PLAID_SECRET:"local", PLAID_ENV:"sandbox",
    ENCRYPTION_KEY:"a".repeat(64), OPENAI_API_KEY:"", ANTHROPIC_API_KEY:"",
    FINNHUB_API_KEY:"", ALPACA_API_KEY:"", ALPACA_API_SECRET:"", MASSIVE_API_KEY:"", POLYGON_API_KEY:"", TIINGO_API_KEY:"",
  } })
  if (result.status !== 0) throw new Error("Hardening integration tests failed")
} finally {
  if (started) execFileSync("docker",["stop",name],{stdio:"pipe"})
  rmSync(temp,{recursive:true,force:true})
}
