// RPGModule.ts — port GDScript RPGModule.gd
// RPG progresní systém: XP křivky, levelování, výpočty statistik.

export type CurveType = 'linear' | 'exponential' | 'polynomial'
export type StatGrowthType = 'linear' | 'percentage'

export interface RPGStat {
  base: number
  growth: number
  growth_type: StatGrowthType
}

export interface RPGConfig {
  curve_type: CurveType
  base_xp: number
  xp_multiplier: number
  xp_exponent: number
  max_level: number
  xp_per_second: number
  current_level: number
  current_xp: number
  stats: Record<string, RPGStat>
}

export interface RPGTickResult {
  xp_gained: number
  new_xp: number
  new_level: number
  leveled_up: boolean
  at_max_level: boolean
}

export interface CurvePoint {
  level: number
  xp_for_level: number
  xp_required: number
  cumulative_xp: number
}

const MAX_SAFE_XP = Number.MAX_SAFE_INTEGER // 2^53 - 1

export function defaultRPGConfig(): RPGConfig {
  return {
    curve_type: 'exponential',
    base_xp: 100,
    xp_multiplier: 1.5,
    xp_exponent: 2.0,
    max_level: 100,
    xp_per_second: 10.0,
    current_level: 1,
    current_xp: 0.0,
    stats: {},
  }
}

// ==================== XP VÝPOČTY ====================

export function getXPForLevel(cfg: RPGConfig, level: number): number {
  if (level <= 1) return 0
  let result: number
  switch (cfg.curve_type) {
    case 'linear':      result = cfg.base_xp * level; break
    case 'exponential': result = cfg.base_xp * Math.pow(cfg.xp_multiplier, level - 1); break
    case 'polynomial':  result = cfg.base_xp * Math.pow(level, cfg.xp_exponent); break
    default:            result = cfg.base_xp * level
  }
  return Math.min(result, MAX_SAFE_XP)
}

export function getTotalXPForLevel(cfg: RPGConfig, level: number): number {
  let total = 0
  for (let i = 1; i <= level; i++) {
    total += getXPForLevel(cfg, i)
    if (total >= MAX_SAFE_XP) return MAX_SAFE_XP
  }
  return total
}

export function getLevelFromXP(cfg: RPGConfig, totalXP: number): number {
  let accumulated = 0
  for (let level = 1; level <= cfg.max_level; level++) {
    accumulated += getXPForLevel(cfg, level)
    if (accumulated > totalXP) return level - 1
  }
  return cfg.max_level
}

// ==================== TICK ====================

export function calculateTick(cfg: RPGConfig, delta: number): [RPGConfig, RPGTickResult] {
  const xpGained = cfg.xp_per_second * delta
  let currentXP = cfg.current_xp + xpGained
  let currentLevel = cfg.current_level
  let leveledUp = false

  while (currentLevel < cfg.max_level) {
    const xpNeeded = getXPForLevel(cfg, currentLevel + 1)
    if (currentXP >= xpNeeded) {
      currentXP -= xpNeeded
      currentLevel++
      leveledUp = true
    } else {
      break
    }
  }

  const newCfg: RPGConfig = { ...cfg, current_xp: currentXP, current_level: currentLevel }
  return [newCfg, {
    xp_gained: xpGained,
    new_xp: currentXP,
    new_level: currentLevel,
    leveled_up: leveledUp,
    at_max_level: currentLevel >= cfg.max_level,
  }]
}

// ==================== KŘIVKA ====================

export function generateCurveData(cfg: RPGConfig): CurvePoint[] {
  const points: CurvePoint[] = []
  let cumulative = 0
  for (let level = 1; level <= cfg.max_level; level++) {
    const xp = getXPForLevel(cfg, level)
    cumulative += xp
    if (cumulative > MAX_SAFE_XP) cumulative = MAX_SAFE_XP
    points.push({ level, xp_for_level: xp, xp_required: xp, cumulative_xp: cumulative })
  }
  return points
}

// ==================== STATISTIKY ====================

export function getStatAtLevel(cfg: RPGConfig, statName: string, level: number): number {
  const stat = cfg.stats[statName]
  if (!stat) return 0
  switch (stat.growth_type) {
    case 'percentage': return stat.base * Math.pow(1 + stat.growth / 100, level - 1)
    default:           return stat.base + stat.growth * (level - 1)
  }
}

export function addStat(cfg: RPGConfig, name: string, base = 10, growth = 1, growthType: StatGrowthType = 'linear'): RPGConfig {
  return { ...cfg, stats: { ...cfg.stats, [name]: { base, growth, growth_type: growthType } } }
}

export function removeStat(cfg: RPGConfig, name: string): RPGConfig {
  const stats = { ...cfg.stats }
  delete stats[name]
  return { ...cfg, stats }
}

// ==================== COST SCALING (z EconomyConfig) ====================

export function getProducerCost(baseCost: number, costCoefficient: number, ownedCount: number): number {
  if (baseCost <= 0) return 0
  return baseCost * Math.pow(costCoefficient, ownedCount)
}

export function formatCost(cost: number, resourceName = ''): string {
  const abs = Math.abs(cost)
  let formatted: string
  if (abs >= 1e12)      formatted = `${(abs / 1e12).toFixed(2)}T`
  else if (abs >= 1e9)  formatted = `${(abs / 1e9).toFixed(2)}B`
  else if (abs >= 1e6)  formatted = `${(abs / 1e6).toFixed(2)}M`
  else if (abs >= 1e3)  formatted = `${(abs / 1e3).toFixed(1)}K`
  else                  formatted = abs.toFixed(0)
  return resourceName ? `${formatted} ${resourceName}` : formatted
}
