// SampleGallery.ts — port GDScript SampleGallery.gd
// Metadata registr 12 vzorových projektů.

export interface SampleMeta {
  name: string
  file: string          // cesta v /public/samples/
  icon: string
  category: string
  description: string
  expected: string
  nodes: number
}

export const SAMPLES: SampleMeta[] = [
  {
    name: 'Idle Tycoon',
    file: 'idle_tycoon.json',
    icon: '⛏️',
    category: 'Idle',
    description: 'Basic gold mine → storage → shop loop. The simplest economy: source, pool, drain.',
    expected: 'Gold grows at +4/s (5 in, 1 out). Pool caps at 1000 after ~250s.',
    nodes: 3,
  },
  {
    name: 'Crafting Chain',
    file: 'crafting_chain.json',
    icon: '🔨',
    category: 'RPG',
    description: 'Multi-resource crafting pipeline with a splitter. Demonstrates converters and splitters.',
    expected: 'Wood and ore feed a converter, output splits to two pools.',
    nodes: 6,
  },
  {
    name: 'Gacha System',
    file: 'gacha_system.json',
    icon: '🎲',
    category: 'Gacha',
    description: 'Chance-based gacha pull with rare/common split. Uses a Chance node for probability.',
    expected: '~15% of pulls are rare. Run Monte Carlo to see distribution.',
    nodes: 4,
  },
  {
    name: 'Energy Regen',
    file: 'energy_regen.json',
    icon: '⚡',
    category: 'Mobile',
    description: 'Energy regeneration vs. action cost. Classic mobile game stamina system.',
    expected: 'Energy depletes over time (drain 5/s > regen 2/s). Empty in ~33s.',
    nodes: 3,
  },
  {
    name: 'RPG Loot',
    file: 'rpg_loot.json',
    icon: '⚔️',
    category: 'RPG',
    description: 'Monster drops with 15% rare loot chance. Uses Chance node for rarity split.',
    expected: '~85% of loot is common, ~15% rare. Run Monte Carlo for variance.',
    nodes: 4,
  },
  {
    name: 'Dual Currency',
    file: 'dual_currency.json',
    icon: '💰',
    category: 'F2P',
    description: 'Soft currency (gold) and hard currency (gems) flowing independently.',
    expected: 'Gold grows fast (+7/s net), gems grow slowly (+0.4/s net).',
    nodes: 6,
  },
  {
    name: 'Gated Progression',
    file: 'gated_progression.json',
    icon: '🚪',
    category: 'RPG',
    description: 'XP accumulation unlocks gold rewards via a gate. Demonstrates conditional flow.',
    expected: 'No gold until XP ≥ 100 (~12.5s), then gold flows at 20/s.',
    nodes: 5,
  },
  {
    name: 'Splitter Economy',
    file: 'splitter_economy.json',
    icon: '🔀',
    category: 'Strategy',
    description: 'Income split 50/30/20 across savings, spending, investment pools.',
    expected: 'Savings gets 5/s, spending 3/s (minus 2/s shop), investment 2/s.',
    nodes: 6,
  },
  {
    name: 'Converter Chain',
    file: 'converter_chain.json',
    icon: '⚙️',
    category: 'RPG',
    description: 'Ore → Ingot → Sword pipeline with two converters. Tests multi-stage production.',
    expected: 'Swords produced at 1 per 10s. Ore stockpiles if smelter is the bottleneck.',
    nodes: 6,
  },
  {
    name: 'Battle Pass',
    file: 'battle_pass.json',
    icon: '🏆',
    category: 'F2P',
    description: 'Battle pass with free and premium reward tracks gated by XP milestones.',
    expected: 'Free rewards unlock at 500 XP (~83s), premium at 1000 XP (~167s).',
    nodes: 9,
  },
  {
    name: 'Survival Hunger',
    file: 'survival_hunger.json',
    icon: '🥩',
    category: 'Survival',
    description: 'Food consumption vs. foraging. HP drains when food runs out (starvation gate).',
    expected: 'Food depletes (drain 4/s > forage 3/s). HP drain activates when food < 10.',
    nodes: 6,
  },
  {
    name: 'Stamina Loop',
    file: 'stamina_loop.json',
    icon: '🏃',
    category: 'Mobile',
    description: 'Stamina regen from rest + potions vs. action drain. Two sources, one sink.',
    expected: 'Stamina depletes (drain 3/s > regen 2/s). Empty in ~50s.',
    nodes: 4,
  },
]

export function getAllSamples(): SampleMeta[] { return SAMPLES }

export function getCategories(): string[] {
  return [...new Set(SAMPLES.map((s) => s.category))].sort()
}

export function getSamplesByCategory(cat: string): SampleMeta[] {
  return SAMPLES.filter((s) => s.category === cat)
}

/** Načte JSON soubor ze /public/samples/ přes fetch */
export async function loadSample(file: string): Promise<unknown> {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  const url = `${base}samples/${file}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Cannot load sample: ${file} (HTTP ${res.status})`)
  return res.json()
}
