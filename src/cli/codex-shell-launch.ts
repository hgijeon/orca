import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnProcess } from '../shared/child-process/run-process'
import { resolveCliCommand } from '../shared/node-cli-command-resolution'
import { stripElectronRunAsNode } from './runtime/launch'

export function buildCodexShellLaunchEnv(
  args: readonly string[],
  sourceEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env = stripElectronRunAsNode(sourceEnv)
  if (args[0] !== 'update' || !env.ORCA_CODEX_HOME) {
    return env
  }
  env.CODEX_HOME = env.ORCA_CODEX_INSTALL_HOME?.trim() || join(homedir(), '.codex')
  delete env.ORCA_CODEX_HOME
  return env
}

/** Runs Codex for cmd.exe, whose interactive shell has no function wrapper. */
export async function runCodexShellLaunch(args: readonly string[]): Promise<void> {
  const env = buildCodexShellLaunchEnv(args)
  const command = resolveCliCommand('codex', {
    pathEnv: env.PATH ?? env.Path ?? null
  })
  process.exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawnProcess({ program: command, args, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve(typeof code === 'number' ? code : signal ? 1 : 0))
  })
}
