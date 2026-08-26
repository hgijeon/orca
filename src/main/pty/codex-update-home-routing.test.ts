import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getFishCodexShellLaunchPreflight,
  getPosixCodexInstallationHomeCapture,
  getPosixCodexShellLaunchPreflight,
  getPowerShellCodexShellLaunchPreflight,
  resolveCodexShellCommandRouterCommand
} from './codex-shell-launch-preflight'

const roots: string[] = []
const fishAvailable = spawnSync('fish', ['--version']).status === 0
const pwshAvailable =
  spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-Command', 'exit 0']).status === 0

function makeProbe(prefix: string): { bin: string; installHome: string; managedHome: string } {
  const root = mkdtempSync(join(tmpdir(), prefix))
  roots.push(root)
  const bin = join(root, 'bin')
  const installHome = join(root, 'install-home')
  const managedHome = join(root, 'managed-home')
  mkdirSync(bin)
  mkdirSync(installHome)
  mkdirSync(managedHome)
  const codex = join(bin, process.platform === 'win32' ? 'codex.cmd' : 'codex')
  writeFileSync(
    codex,
    process.platform === 'win32'
      ? '@echo off\necho home=%CODEX_HOME%\nif defined ORCA_CODEX_HOME (echo managed=%ORCA_CODEX_HOME%) else echo managed=unset\necho args=%*\n'
      : '#!/bin/sh\nprintf "home=%s\\nmanaged=%s\\nargs=%s\\n" "$CODEX_HOME" "${ORCA_CODEX_HOME-unset}" "$*"\n'
  )
  if (process.platform !== 'win32') {
    chmodSync(codex, 0o755)
  }
  return { bin, installHome, managedHome }
}

function probeEnv(probe: ReturnType<typeof makeProbe>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${probe.bin}${delimiter}${process.env.PATH ?? ''}`,
    CODEX_HOME: probe.managedHome,
    ORCA_CODEX_HOME: probe.managedHome,
    ORCA_CODEX_INSTALL_HOME: probe.installHome
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe.skipIf(process.platform === 'win32')('POSIX Codex update home routing', () => {
  it('does not publish an installation home without a managed account', () => {
    const output = execFileSync(
      '/bin/bash',
      [
        '--noprofile',
        '--norc',
        '-c',
        `${getPosixCodexInstallationHomeCapture()}\nprintf %s "\${ORCA_CODEX_INSTALL_HOME-unset}"`
      ],
      { encoding: 'utf-8', env: { ...process.env, ORCA_CODEX_HOME: undefined } }
    )

    expect(output).toBe('unset')
  })

  it('captures a guest installation home before restoring the account home', () => {
    const probe = makeProbe('orca-codex-guest-route-')
    const env = probeEnv(probe)
    env.CODEX_HOME = probe.installHome
    delete env.ORCA_CODEX_INSTALL_HOME
    const output = execFileSync(
      '/bin/bash',
      [
        '--noprofile',
        '--norc',
        '-c',
        `${getPosixCodexInstallationHomeCapture()}\nexport CODEX_HOME="$ORCA_CODEX_HOME"\n${getPosixCodexShellLaunchPreflight()}\ncodex update`
      ],
      { encoding: 'utf-8', env }
    )

    expect(output).toBe(`home=${probe.installHome}\nmanaged=unset\nargs=update\n`)
  })

  for (const shell of ['/bin/bash', '/bin/zsh']) {
    it.skipIf(!existsSync(shell))(`routes ${shell} update to the installation home`, () => {
      const probe = makeProbe('orca-codex-posix-route-')
      const shellArgs = shell.endsWith('/zsh') ? ['-f', '-c'] : ['--noprofile', '--norc', '-c']
      const output = execFileSync(
        shell,
        [...shellArgs, `${getPosixCodexShellLaunchPreflight()}\ncodex update`],
        { encoding: 'utf-8', env: probeEnv(probe) }
      )

      expect(output).toBe(`home=${probe.installHome}\nmanaged=unset\nargs=update\n`)
    })
  }

  it('keeps normal commands on the account home', () => {
    const probe = makeProbe('orca-codex-account-route-')
    const output = execFileSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-c', `${getPosixCodexShellLaunchPreflight()}\ncodex resume`],
      { encoding: 'utf-8', env: probeEnv(probe) }
    )

    expect(output).toBe(`home=${probe.managedHome}\nmanaged=${probe.managedHome}\nargs=resume\n`)
  })

  it.skipIf(!fishAvailable)('routes fish update to the installation home', () => {
    const probe = makeProbe('orca-codex-fish-route-')
    const output = execFileSync(
      'fish',
      ['--no-config', '-c', `${getFishCodexShellLaunchPreflight()}\ncodex update`],
      { encoding: 'utf-8', env: probeEnv(probe) }
    )

    expect(output).toBe(`home=${probe.installHome}\nmanaged=unset\nargs=update\n`)
  })
})

describe('Windows Codex update home routing', () => {
  it.skipIf(!pwshAvailable)('routes PowerShell update to the installation home', () => {
    const probe = makeProbe('orca-codex-pwsh-route-')
    const result = spawnSync(
      'pwsh',
      [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        `${getPowerShellCodexShellLaunchPreflight()}\ncodex update`
      ],
      { encoding: 'utf-8', env: probeEnv(probe) }
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.replaceAll('\r\n', '\n')).toBe(
      `home=${probe.installHome}\nmanaged=unset\nargs=update\n`
    )
  })

  it('resolves the cmd.exe router without enabling hook preflight', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-codex-cmd-router-'))
    roots.push(root)
    const userDataPath = join(root, 'user-data')
    const resourcesPath = join(root, 'resources')
    const launcher = join(resourcesPath, 'bin', 'orca.exe')
    mkdirSync(join(userDataPath, 'cli', 'bin'), { recursive: true })
    mkdirSync(join(resourcesPath, 'bin'), { recursive: true })
    writeFileSync(launcher, '')

    expect(
      resolveCodexShellCommandRouterCommand({
        isPackaged: true,
        managedHomePath: 'C:\\Orca\\account',
        userDataPath,
        resourcesPath,
        platform: 'win32'
      })
    ).toBe(launcher)
  })
})
