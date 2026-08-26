import { accessSync, constants, statSync } from 'node:fs'
import { join } from 'node:path'
import { getBundledLauncherPath } from '../cli/bundled-cli-launcher-path'

const DEV_LAUNCHER_DIR = ['cli', 'bin']
const DEV_COMMAND_NAME = 'orca-dev'

export type CodexShellLaunchPreflightCommandOptions = {
  hooksEnabled: boolean
  isPackaged: boolean
  isWsl?: boolean
  managedHomePath: string | null
  /** Where the dev launcher is written; `join(userDataPath, 'cli', 'bin')` is also what managed dev PTYs prepend to PATH. */
  userDataPath: string
  /** Packaged app resources root; the bundled launcher lives under it. */
  resourcesPath?: string | null
  /** Test seam. */
  platform?: NodeJS.Platform
}

/** Absolute path of the Orca CLI the preflight must execute, or null to skip it.
 *
 *  Why absolute: the value rides in ORCA_CODEX_LAUNCH_PREFLIGHT and is invoked
 *  from the codex() wrapper, which shell-ready emits *after* the user's profile
 *  scripts run. Those scripts routinely rewrite PATH, so an unqualified name
 *  would be resolved against a PATH Orca neither controls nor can predict —
 *  handing Orca's managed Codex environment to an unidentified program. When no
 *  path verifies, skipping the preflight is the predictable degradation. */
export function resolveCodexShellLaunchPreflightCommand(
  options: CodexShellLaunchPreflightCommandOptions
): string | null {
  if (!options.hooksEnabled || options.isWsl || !options.managedHomePath) {
    return null
  }
  const platform = options.platform ?? process.platform
  const candidate = options.isPackaged
    ? options.resourcesPath
      ? getBundledLauncherPath(platform, options.resourcesPath)
      : null
    : join(
        options.userDataPath,
        ...DEV_LAUNCHER_DIR,
        platform === 'win32' ? `${DEV_COMMAND_NAME}.cmd` : DEV_COMMAND_NAME
      )
  return candidate && isExecutableFileOnDisk(candidate, platform) ? candidate : null
}

function isExecutableFileOnDisk(path: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(path).isFile()) {
      return false
    }
    // Why: Windows has no exec bit, so a readable launcher file is the strongest signal available.
    accessSync(path, platform === 'win32' ? constants.R_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function getPosixCodexShellLaunchPreflight(): string {
  return `# Why: a typed alias expands inside the shell, after pane launch prep.
# Why unalias inside the substitution: an alias named codex makes command -v
# report the alias text, and the subshell leaves the user's own alias intact.
# Why || : twice — zsh alone aborts inside the substitution, but every shell's
# assignment adopts its exit status, so an absent codex trips set -e in bash too.
__orca_codex_binary="$(unalias codex 2>/dev/null || :; command -v codex 2>/dev/null || :)"
if [[ -n "\${__orca_codex_binary:-}" && -x "\${__orca_codex_binary}" && ( -n "\${ORCA_CODEX_LAUNCH_PREFLIGHT:-}" || ( -n "\${ORCA_CODEX_HOME:-}" && "\${CODEX_HOME:-}" == "\${ORCA_CODEX_HOME}" ) ) ]]; then
  # Why the function reserved word: it suppresses alias expansion of the name,
  # which otherwise rewrites this header at parse time and aborts the whole file.
  function codex {
    if [[ "\${1:-}" == "update" && -n "\${ORCA_CODEX_HOME:-}" && "\${CODEX_HOME:-}" == "\${ORCA_CODEX_HOME}" ]]; then
      command env -u CODEX_HOME -u ORCA_CODEX_HOME codex "$@"
      return $?
    fi
    if [[ -n "\${ORCA_CODEX_LAUNCH_PREFLIGHT:-}" ]]; then
      "\${ORCA_CODEX_LAUNCH_PREFLIGHT}" agent hooks prepare-codex >/dev/null 2>&1 || :
    fi
    command codex "$@"
  }
fi
unset __orca_codex_binary
`
}

export function getFishCodexShellLaunchPreflight(): string {
  return `if test (type -t codex 2>/dev/null) = file
  if test -n "$ORCA_CODEX_LAUNCH_PREFLIGHT"; or begin; test -n "$ORCA_CODEX_HOME"; and test "$CODEX_HOME" = "$ORCA_CODEX_HOME"; end
    function codex
      if test (count $argv) -gt 0; and test "$argv[1]" = update; and test -n "$ORCA_CODEX_HOME"; and test "$CODEX_HOME" = "$ORCA_CODEX_HOME"
        command env -u CODEX_HOME -u ORCA_CODEX_HOME codex $argv
        return $status
      end
      if test -n "$ORCA_CODEX_LAUNCH_PREFLIGHT"
        command "$ORCA_CODEX_LAUNCH_PREFLIGHT" agent hooks prepare-codex >/dev/null 2>&1; or true
      end
      command codex $argv
    end
  end
end`
}

export function getPowerShellCodexShellLaunchPreflight(): string {
  return `$orcaCodexCommand = Get-Command codex -ErrorAction SilentlyContinue | Select-Object -First 1
if ($orcaCodexCommand -and
    ($env:ORCA_CODEX_LAUNCH_PREFLIGHT -or
     ($env:ORCA_CODEX_HOME -and $env:CODEX_HOME -eq $env:ORCA_CODEX_HOME)) -and
    $orcaCodexCommand.CommandType -in @("Application", "ExternalScript")) {
    function Global:codex {
        $orcaCodexExecutable = Get-Command codex -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $orcaCodexExecutable) {
            Write-Error "codex executable not found"
            $global:LASTEXITCODE = 127
            return
        }
        if ($args.Count -gt 0 -and $args[0] -eq "update" -and
            $env:ORCA_CODEX_HOME -and $env:CODEX_HOME -eq $env:ORCA_CODEX_HOME) {
            $orcaManagedCodexHome = $env:ORCA_CODEX_HOME
            $orcaRoutedCodexHome = $env:CODEX_HOME
            Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue
            Remove-Item Env:ORCA_CODEX_HOME -ErrorAction SilentlyContinue
            try {
                & $orcaCodexExecutable.Source @args
                $orcaCodexExitCode = $LASTEXITCODE
            } finally {
                $env:CODEX_HOME = $orcaRoutedCodexHome
                $env:ORCA_CODEX_HOME = $orcaManagedCodexHome
            }
            $global:LASTEXITCODE = $orcaCodexExitCode
            return
        }
        if ($env:ORCA_CODEX_LAUNCH_PREFLIGHT) {
            try {
                & $env:ORCA_CODEX_LAUNCH_PREFLIGHT agent hooks prepare-codex *> $null
            } catch {
            }
        }
        & $orcaCodexExecutable.Source @args
        $global:LASTEXITCODE = $LASTEXITCODE
    }
}
Remove-Variable orcaCodexCommand -ErrorAction SilentlyContinue`
}
