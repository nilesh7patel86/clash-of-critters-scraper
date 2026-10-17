#!/usr/bin/env node
/**
 * Find and kill every running instance of this app.
 *
 * "Instance" means a Vite dev server or `vite preview` (plus the npm/npx/cmd
 * wrapper processes that launched it), so a stray server from an earlier
 * terminal never keeps a port hostage. Because it is the last build step, the
 * preview server is easy to forget about - it is matched too.
 *
 *   npm run kill             # kill dev + preview servers for this project
 *   npm run kill -- --dry-run  # list what would be killed, change nothing
 *   npm run kill -- --all      # also kill other node processes in this repo
 *                              # (e.g. a running scraper)
 *   npm run kill -- --ports 5199,5200   # also watch extra ports
 *
 * Matching is belt-and-braces so a renamed/relocated wrapper is still caught:
 *   1. a node process whose command line references this project and runs Vite;
 *   2. any process listening on a Vite port (5173 dev / 4173 preview by default).
 * From each match the script walks up through the node/npm/npx/cmd wrapper
 * chain to the owning process, then kills that whole tree - never the terminal
 * it was launched from, never this script.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const run = promisify(execFile)
const isWindows = process.platform === 'win32'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootKey = normalize(projectRoot)

const DEFAULT_PORTS = [5173, 4173] // vite dev / vite preview defaults

function normalize(value) {
  return String(value ?? '').replace(/\\/g, '/').toLowerCase()
}

function isNode(name) {
  return /^node(\.exe)?$/i.test(name ?? '')
}

function isCmd(name) {
  return /^cmd(\.exe)?$/i.test(name ?? '')
}

/** A node process whose command line runs Vite (dev or preview). */
function isVite(cmd) {
  return /vite[\\/]bin[\\/]vite|(^|[\s"'/])vite(\.js)?(\s|$)|vite\.cmd/i.test(cmd ?? '')
}

/** The npm/npx launcher that owns a Vite child. */
function isNpmLauncher(cmd) {
  return /(npm-cli|npx-cli)\.js/i.test(cmd ?? '')
}

function parseArgs(argv) {
  const options = { dryRun: false, all: false, ports: new Set(DEFAULT_PORTS) }
  const addPorts = (value) => {
    for (const piece of String(value).split(/[,\s]+/)) {
      if (!piece) continue
      const port = Number(piece)
      if (Number.isInteger(port) && port > 0) options.ports.add(port)
      else console.warn(`Ignoring invalid port: ${piece}`)
    }
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run' || arg === '-n') options.dryRun = true
    else if (arg === '--all' || arg === '-a') options.all = true
    else if (arg === '--ports') addPorts(argv[++i])
    else if (arg.startsWith('--ports=')) addPorts(arg.slice('--ports='.length))
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (/^\d+$/.test(arg)) addPorts(arg)
    else console.warn(`Ignoring unknown argument: ${arg}`)
  }
  return options
}

function printHelp() {
  console.log(`Find and kill every running instance of this app.

Usage: node scripts/kill-app.mjs [options]

Options:
  -n, --dry-run      List matches without killing anything.
  -a, --all          Also kill other node processes in this repo (e.g. the scraper).
      --ports <list>  Extra ports to treat as app ports (comma or space separated).
  -h, --help         Show this help.

Defaults: watch ports ${DEFAULT_PORTS.join(', ')} and match Vite processes that
reference ${projectRoot}.`)
}

/** Every visible process as { pid, ppid, name, cmd }. */
async function listProcesses() {
  if (isWindows) {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 3'],
      { maxBuffer: 64 * 1024 * 1024 },
    )
    const text = stdout.trim()
    if (!text) return []
    const parsed = JSON.parse(text)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows
      .map((row) => ({
        pid: Number(row.ProcessId),
        ppid: Number(row.ParentProcessId),
        name: row.Name ?? '',
        cmd: row.CommandLine ?? '',
      }))
      .filter((proc) => Number.isInteger(proc.pid) && proc.pid > 0)
  }

  const { stdout } = await run('ps', ['-Ao', 'pid=,ppid=,args='], { maxBuffer: 64 * 1024 * 1024 })
  return stdout
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)
      if (!match) return null
      const cmd = match[3].trim()
      return { pid: Number(match[1]), ppid: Number(match[2]), name: cmd.split(/\s+/)[0].split('/').pop(), cmd }
    })
    .filter((proc) => proc && proc.pid > 0)
}

/** Map of pid -> port for processes listening on the watched ports. */
async function listenersOnPorts(ports) {
  const found = new Map()
  if (isWindows) {
    const { stdout } = await run('netstat', ['-ano', '-p', 'TCP'], { maxBuffer: 32 * 1024 * 1024 })
    for (const line of stdout.split('\n')) {
      const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i)
      if (!match) continue
      const port = Number(match[1])
      if (ports.has(port)) found.set(Number(match[2]), port)
    }
    return found
  }

  // macOS/BSD: lsof -iTCP -sTCP:LISTEN has a NAME column ending in :<port>.
  try {
    const { stdout } = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { maxBuffer: 32 * 1024 * 1024 })
    for (const line of stdout.split('\n')) {
      const cols = line.trim().split(/\s+/)
      if (cols.length < 9) continue
      const portMatch = cols[cols.length - 1].match(/:(\d+)$/)
      if (!portMatch) continue
      const port = Number(portMatch[1])
      if (ports.has(port)) found.set(Number(cols[1]), port)
    }
    if (found.size) return found
  } catch { /* lsof absent - fall through */ }

  // Linux: ss -ltnp prints user:(("node",pid=1234,fd=20)) beside the address.
  try {
    const { stdout } = await run('ss', ['-ltnp'], { maxBuffer: 32 * 1024 * 1024 })
    for (const line of stdout.split('\n')) {
      const portMatch = line.match(/:(\d+)\s/)
      const pidMatch = line.match(/pid=(\d+)/)
      if (!portMatch || !pidMatch) continue
      const port = Number(portMatch[1])
      if (ports.has(port)) found.set(Number(pidMatch[1]), port)
    }
  } catch { /* ss absent - give up on port matching */ }
  return found
}

function buildIndex(processes) {
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]))
  const children = new Map()
  for (const proc of processes) {
    if (!children.has(proc.ppid)) children.set(proc.ppid, [])
    children.get(proc.ppid).push(proc)
  }
  return { byPid, children }
}

function ancestorsOf(pid, byPid) {
  const out = []
  let current = byPid.get(pid)
  const seen = new Set([pid])
  while (current && byPid.has(current.ppid) && !seen.has(current.ppid)) {
    const parent = byPid.get(current.ppid)
    out.push(parent)
    seen.add(parent.pid)
    current = parent
    if (out.length > 128) break
  }
  return out
}

function descendantsOf(pid, children) {
  const out = []
  const stack = [pid]
  const seen = new Set([pid])
  while (stack.length) {
    for (const child of children.get(stack.pop()) ?? []) {
      if (seen.has(child.pid)) continue
      seen.add(child.pid)
      out.push(child)
      stack.push(child.pid)
    }
  }
  return out
}

/**
 * Walk up from a match to the process that should be killed as the tree root:
 * the npm/npx launcher when there is one, otherwise the match itself. The walk
 * only crosses node/cmd wrappers, so it stops well short of a real terminal.
 */
function findAnchor(seed, byPid) {
  for (const ancestor of ancestorsOf(seed.pid, byPid)) {
    if (isNode(ancestor.name) && isNpmLauncher(ancestor.cmd)) return ancestor
    if (!isNode(ancestor.name) && !isCmd(ancestor.name)) break
  }
  return seed
}

function describe(proc) {
  const cmd = proc.cmd.length > 90 ? `${proc.cmd.slice(0, 89)}…` : proc.cmd
  return `${proc.name} (${cmd || 'no command line'})`
}

async function killTree(pid) {
  if (isWindows) {
    await run('taskkill', ['/PID', String(pid), '/T', '/F'], { maxBuffer: 8 * 1024 * 1024 })
  } else {
    process.kill(pid, 'SIGTERM')
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return printHelp()

  const processes = await listProcesses()
  const { byPid, children } = buildIndex(processes)
  const listeners = await listenersOnPorts(options.ports)

  // Never kill this script or the shell/agent chain that launched it.
  const selfChain = new Set([process.pid, process.ppid, ...ancestorsOf(process.pid, byPid).map((proc) => proc.pid)])

  const seeds = new Map() // pid -> reason
  for (const proc of processes) {
    if (!isNode(proc.name)) continue
    if (!normalize(proc.cmd).includes(rootKey)) continue
    if (isVite(proc.cmd)) seeds.set(proc.pid, 'this project')
    else if (options.all) seeds.set(proc.pid, 'this project (--all)')
  }
  for (const [pid, port] of listeners) {
    if (!seeds.has(pid)) seeds.set(pid, `port ${port}`)
  }

  const groups = new Map() // anchor pid -> { anchor, reason, members }
  for (const [pid, reason] of seeds) {
    const seed = byPid.get(pid)
    if (!seed) continue
    const anchor = findAnchor(seed, byPid)
    if (selfChain.has(anchor.pid)) continue
    if (!groups.has(anchor.pid)) groups.set(anchor.pid, { anchor, reason, members: [] })
    const members = groups.get(anchor.pid).members
    for (const proc of [seed, ...descendantsOf(anchor.pid, children)]) {
      if (selfChain.has(proc.pid)) continue
      if (!members.some((member) => member.pid === proc.pid)) members.push(proc)
    }
  }

  console.log(`Clash of Critters - stop running instances`)
  console.log(`  project: ${projectRoot}`)
  console.log(`  ports:   ${[...options.ports].join(', ')}`)
  console.log('')

  if (!groups.size) {
    console.log('No running instances found.')
    return
  }

  let total = 0
  for (const { anchor, reason, members } of groups.values()) {
    console.log(`Group (matched by ${reason}), root PID ${anchor.pid}:`)
    const list = [anchor, ...members.filter((member) => member.pid !== anchor.pid)]
    for (const proc of list) {
      console.log(`  ${proc.pid === anchor.pid ? '*' : ' '} ${String(proc.pid).padStart(6)}  ${describe(proc)}`)
    }
    total += list.length
  }

  if (options.dryRun) {
    console.log(`\nDry run - would kill ${total} process(es) across ${groups.size} group(s).`)
    return
  }

  console.log(`\nKilling ${groups.size} process group(s)...`)
  let killed = 0
  let failed = 0
  for (const { anchor } of groups.values()) {
    try {
      await killTree(anchor.pid)
      killed += 1
      console.log(`  killed root PID ${anchor.pid} ${describe(anchor)}`)
    } catch (error) {
      failed += 1
      console.warn(`  could not kill root PID ${anchor.pid}: ${error.message}`)
    }
  }
  console.log(`\nDone. Stopped ${killed} group(s)${failed ? `, ${failed} failed` : ''}.`)
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error(`kill-app failed: ${error.stack || error.message}`)
  process.exitCode = 1
})
