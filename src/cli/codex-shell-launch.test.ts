import { describe, expect, it } from 'vitest'
import { buildCodexShellLaunchEnv } from './codex-shell-launch'

describe('Codex cmd.exe shell launch', () => {
  it('routes update through the installation home', () => {
    expect(
      buildCodexShellLaunchEnv(['update'], {
        CODEX_HOME: 'C:\\Orca\\account',
        ORCA_CODEX_HOME: 'C:\\Orca\\account',
        ORCA_CODEX_INSTALL_HOME: 'C:\\Users\\Ada\\.codex',
        ELECTRON_RUN_AS_NODE: '1'
      })
    ).toEqual({
      CODEX_HOME: 'C:\\Users\\Ada\\.codex',
      ORCA_CODEX_INSTALL_HOME: 'C:\\Users\\Ada\\.codex'
    })
  })

  it('keeps normal commands on the account home', () => {
    expect(
      buildCodexShellLaunchEnv(['resume', '--last'], {
        CODEX_HOME: 'C:\\Orca\\account',
        ORCA_CODEX_HOME: 'C:\\Orca\\account'
      })
    ).toEqual({
      CODEX_HOME: 'C:\\Orca\\account',
      ORCA_CODEX_HOME: 'C:\\Orca\\account'
    })
  })
})
