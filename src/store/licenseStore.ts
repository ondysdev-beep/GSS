// licenseStore.ts — PRO/FREE state, derived fresh from the build variant
// on every launch (see useLicense.ts). NOT persisted to localStorage —
// that's the point. The old runtime license-key system stored `isPro` in
// localStorage under key `gss_license_v2`, which meant a user could set
// `isPro: true` directly in devtools and it would survive restarts. Now
// there's nothing to persist: PRO/FREE is baked into which binary/build
// you're running, re-derived from platform.getBuildVariant() every time
// the app starts, so there's no stored trust state to tamper with.

import { create } from 'zustand'

export interface LicenseInfo {
  isPro: boolean
}

interface LicenseStore {
  license: LicenseInfo | null
  isLoading: boolean

  setLicense: (license: LicenseInfo | null) => void
  setLoading: (loading: boolean) => void
}

export const useLicenseStore = create<LicenseStore>((set) => ({
  license: null,
  isLoading: true,

  setLicense: (license) => set({ license }),
  setLoading: (isLoading) => set({ isLoading }),
}))
