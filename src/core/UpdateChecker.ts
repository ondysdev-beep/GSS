// UpdateChecker.ts — app-wide constants (version, store/repo links) plus a
// manifest-based update check (VITE_VERSION_MANIFEST_URL).
//
// The desktop app no longer calls checkForUpdates(): real updates go through
// the Tauri updater (platform.checkForAppUpdate, see UpdateBanner.tsx). The
// function is kept for builds that set VITE_VERSION_MANIFEST_URL explicitly.

import { Logger } from './Logger'
import { APP_VERSION as _APP_VERSION } from './version'

export const APP_VERSION = _APP_VERSION
export const ITCH_URL = 'https://neopryus.itch.io/idle-economy-simulator'
export const GITHUB_URL = 'https://github.com/ondysdev-beep/GSS'

const _env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
const VERSION_MANIFEST_URL: string | undefined = _env?.VITE_VERSION_MANIFEST_URL || undefined

export interface UpdateInfo {
  version: string
  changelog: string
  download_url: string
  mandatory: boolean
}

export interface UpdateCheckResult {
  is_up_to_date: boolean
  info: UpdateInfo | null
  error: string | null
}

/** Semver porovnání: vrátí true pokud remote > local */
export function isNewer(remote: string, local: string): boolean {
  // Pre-release/build suffixy ("3.4.0-beta.1", "v3.4.0") dřív daly NaN a
  // porovnání vždy vrátilo false. Porovnává se jen číselné jádro x.y.z.
  const core = (v: string) => v.trim().replace(/^v/i, '').split(/[-+]/)[0].split('.').map((p) => parseInt(p, 10) || 0)
  const rParts = core(remote)
  const lParts = core(local)
  const len = Math.max(rParts.length, lParts.length)
  for (let i = 0; i < len; i++) {
    const r = rParts[i] ?? 0
    const l = lParts[i] ?? 0
    if (r > l) return true
    if (r < l) return false
  }
  return false
}

/** Check for updates. Returns UpdateCheckResult. */
export async function checkForUpdates(
  manifestUrl: string | undefined = VERSION_MANIFEST_URL,
  currentVersion = APP_VERSION,
): Promise<UpdateCheckResult> {
  if (!manifestUrl) {
    Logger.info('Update check disabled: no manifest configured')
    return { is_up_to_date: true, info: null, error: null }
  }
  try {
    const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      return {
        is_up_to_date: true,
        info: null,
        error: `Update check failed (HTTP ${res.status})`,
      }
    }

    const data = (await res.json()) as Partial<UpdateInfo>
    const remoteVersion = data.version ?? '0.0.0'

    const info: UpdateInfo = {
      version: remoteVersion,
      changelog: data.changelog ?? '',
      download_url: data.download_url ?? ITCH_URL,
      mandatory: data.mandatory ?? false,
    }

    const updateAvailable = isNewer(remoteVersion, currentVersion)
    return { is_up_to_date: !updateAvailable, info, error: null }
  } catch (err) {
    return {
      is_up_to_date: true,
      info: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
