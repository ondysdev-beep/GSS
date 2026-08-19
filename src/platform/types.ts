// platform/types.ts — rozhraní oddělující GSS od konkrétního běhového
// prostředí (desktop Tauri vs. web prohlížeč).
//
// Proč tohle existuje: komponenty (Toolbar, ExportPanel, DiffViewerPanel,
// SettingsModal, useLicense, EconomyGenerator) dřív volaly Tauri API
// (`invoke()`, `@tauri-apps/plugin-dialog`) přímo. Webová verze GSS běží
// v prohlížeči bez Tauri runtime, takže potřebuje jinou implementaci
// stejné funkčnosti (native file dialog → <input type="file">/download,
// tauri-plugin-store → localStorage, Rust license check → build-time
// konstanta). Komponenty samotné se nemění vůbec — jen volají tohle
// rozhraní a "adaptér" se vybere jednou při startu (viz platform/index.ts).

export interface OpenFileResult {
  /** Zobrazovaný název/cesta souboru (na webu jen jméno, na desktopu plná cesta). */
  path: string
  content: string
}

export interface FilePlatform {
  /** Otevře výběr souboru a vrátí jeho obsah, nebo null při zrušení. */
  openFile(extensions: string[]): Promise<OpenFileResult | null>
  /** Uloží `content` pod `defaultName` a vrátí zobrazovaný název, nebo null při zrušení. */
  saveFile(extensions: string[], defaultName: string, content: string): Promise<string | null>
}

export interface LicensePlatform {
  /** 'pro' pokud jde o PRO build (na webu: build-time env, na desktopu: Rust cfg feature). */
  getBuildVariant(): Promise<'free' | 'pro'>
}

export interface AIPlatform {
  hasAnthropicApiKey(): Promise<boolean>
  saveAnthropicApiKey(key: string): Promise<void>
  clearAnthropicApiKey(): Promise<void>
  /** Vrací syrovou textovou odpověď modelu — parsování a validace zůstává v EconomyGenerator.ts, beze změny mezi platformami. */
  generateEconomyGraph(prompt: string): Promise<string>
}

export interface AppUpdateInfo {
  version: string
  notes: string
}

export interface UpdatePlatform {
  /**
   * null = žádná aktualizace k dispozici. Na webu vždy null — web nemá
   * co kontrolovat, obnovením stránky uživatel vždy dostane nejnovější
   * nasazenou verzi, žádný "nainstalovaný" stav neexistuje.
   */
  checkForAppUpdate(): Promise<AppUpdateInfo | null>
  /**
   * Stáhne a nainstaluje aktualizaci nalezenou předchozím
   * `checkForAppUpdate()` a appku restartuje. Vyhazuje, pokud
   * `checkForAppUpdate()` nebyla zavolána nebo nenašla nic k instalaci.
   */
  installAppUpdate(onProgress?: (downloadedBytes: number, totalBytes: number) => void): Promise<void>
}

export interface PlatformAdapter extends FilePlatform, LicensePlatform, AIPlatform, UpdatePlatform {
  readonly name: 'tauri' | 'web'
}

/** Chyba pro funkce, které daná platforma záměrně nepodporuje (ne bug, ne pád — explicitní stav). */
export class PlatformUnsupportedError extends Error {
  constructor(feature: string, platform: string) {
    super(`"${feature}" is not supported on this platform (${platform}).`)
    this.name = 'PlatformUnsupportedError'
  }
}
