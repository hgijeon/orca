import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSystemCodexHomePath } from './codex-home-paths'
import {
  ORCA_CODEX_INSTALL_HOME_ENV,
  resolveCodexInstallationHomeForLaunch
} from './codex-installation-home'

describe('Codex installation home', () => {
  it('uses the execution host default independently of an account home', () => {
    expect(
      resolveCodexInstallationHomeForLaunch({
        HOME: process.env.HOME,
        CODEX_HOME: undefined,
        ORCA_CODEX_HOME: undefined
      })
    ).toBe(getSystemCodexHomePath())
  })

  it('preserves a user-owned custom home', () => {
    const customHome = join(getSystemCodexHomePath(), '..', 'custom-codex')
    expect(
      resolveCodexInstallationHomeForLaunch({
        HOME: process.env.HOME,
        CODEX_HOME: customHome,
        ORCA_CODEX_HOME: undefined
      })
    ).toBe(customHome)
  })

  it('carries an installation home through nested Orca panes', () => {
    expect(
      resolveCodexInstallationHomeForLaunch({
        CODEX_HOME: '/orca/account/home',
        ORCA_CODEX_HOME: '/orca/account/home',
        [ORCA_CODEX_INSTALL_HOME_ENV]: '/user/codex/home'
      })
    ).toBe('/user/codex/home')
  })

  it('leaves WSL installation-home resolution to the guest', () => {
    expect(
      resolveCodexInstallationHomeForLaunch({ CODEX_HOME: 'C:\\Users\\Ada\\.codex' }, true)
    ).toBeUndefined()
  })
})
