import { getSystemCodexHomePath } from './codex-home-paths'
import { getCustomCodexHomeOverrideForLaunch } from './codex-real-home-path'

export const ORCA_CODEX_INSTALL_HOME_ENV = 'ORCA_CODEX_INSTALL_HOME'

function launchEnvValue(launchEnv: NodeJS.ProcessEnv | undefined, key: string): string | undefined {
  return launchEnv && Object.hasOwn(launchEnv, key) ? launchEnv[key] : process.env[key]
}

/** Resolves the execution host's Codex home before Orca selects an account home. */
export function resolveCodexInstallationHomeForLaunch(
  launchEnv?: NodeJS.ProcessEnv,
  isWsl = false
): string | undefined {
  // Why: Windows cannot resolve the guest user's home; the in-guest shell adapter owns it.
  if (isWsl) {
    return undefined
  }

  const codexHome = launchEnvValue(launchEnv, 'CODEX_HOME')
  const orcaCodexHome = launchEnvValue(launchEnv, 'ORCA_CODEX_HOME')
  const inheritedInstallationHome = launchEnvValue(launchEnv, ORCA_CODEX_INSTALL_HOME_ENV)?.trim()
  if (inheritedInstallationHome && orcaCodexHome && codexHome === orcaCodexHome) {
    return inheritedInstallationHome
  }

  return (
    getCustomCodexHomeOverrideForLaunch(launchEnv)?.context.codexHome ?? getSystemCodexHomePath()
  )
}
