// useLicense.ts — PRO/FREE detection derived from the build variant.
//
// GSS no longer has a runtime license-key system. Which edition you get is
// decided at build/download time (separate FREE and PRO artifacts — see
// .github/workflows/ci.yml matrix and src-tauri/Cargo.toml `pro` feature),
// not by anything the app validates while running. This hook just asks
// the platform "which build is this?" once on mount.

import { useEffect } from 'react'
import { platform } from '../platform'
import { useLicenseStore } from '../store/licenseStore'
import type { LicenseInfo } from '../store/licenseStore'

export interface UseLicenseReturn {
  isPro: boolean
  isLoading: boolean
  license: LicenseInfo | null
}

export function useLicense(): UseLicenseReturn {
  const { license, isLoading, setLicense, setLoading } = useLicenseStore()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    platform.getBuildVariant()
      .then((variant) => { if (!cancelled) setLicense({ isPro: variant === 'pro' }) })
      .catch(() => { if (!cancelled) setLicense({ isPro: false }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    isPro: license?.isPro ?? false,
    isLoading,
    license,
  }
}
