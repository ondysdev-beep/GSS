// example.test.ts — regrese B4: sdk/example.ts dřív padal se syrovým Node
// stack trace na běžné chyby (neexistující soubor, neplatný JSON, špatné
// číselné argumenty). Testováno spuštěním jako skutečný podproces (ne
// importem `main()` přímo — ten interně volá `process.exit()`, což by
// zabilo testovací proces).

import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)
const CLI = join(__dirname, 'example.ts')

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('npx', ['tsx', CLI, ...args], { cwd: join(__dirname, '..') })
    return { stdout, stderr, code: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number }
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 }
  }
}

describe('sdk/example.ts CLI — regression B4', () => {
  it('nonexistent file: clean message, exit 1, no Node stack trace', async () => {
    const { stderr, code } = await runCli(['/tmp/gss-sdk-test-does-not-exist.gss'])
    expect(code).toBe(1)
    expect(stderr).toContain('Failed to read file')
    expect(stderr).not.toContain('at readFileSync')
    expect(stderr).not.toContain('node:internal')
  }, 20_000)

  it('invalid JSON in file: clean message, exit 1, no Node stack trace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gss-sdk-test-'))
    const path = join(dir, 'bad.gss')
    writeFileSync(path, 'not valid json {{{')
    const { stderr, code } = await runCli([path])
    expect(code).toBe(1)
    expect(stderr).toContain('does not contain valid JSON')
    expect(stderr).not.toContain('at JSON.parse')
  }, 20_000)

  it('invalid number in ticks argument: clean message, exit 1', async () => {
    const { stderr, code } = await runCli(['public/samples/idle_tycoon.json', 'abc'])
    expect(code).toBe(1)
    expect(stderr).toContain('Invalid "ticks" value')
  }, 20_000)

  it('valid graph: happy path still works (no regression)', async () => {
    const { stdout, code } = await runCli(['public/samples/idle_tycoon.json', '30', '1', '7'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.final_pools.gold_pool.amount).toBe(120)
  }, 20_000)
})
