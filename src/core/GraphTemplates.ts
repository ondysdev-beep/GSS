// GraphTemplates.ts — port GDScript GraphTemplates.gd
// Předpřipravené šablony pro rychlý start v editoru grafů.

import type { GSSGraph } from '../types/graph'
import { GSS_FORMAT_VERSION } from '../types/graph'
import { TICK_SPEC_VERSION } from './TickEngine'

export interface TemplateMeta {
  id: string
  name: string
  description: string
  category: string
  /** Hlavní/měnový resource šablony — výchozí pole pro přejmenování v Template Wizardu. */
  primaryResource: string
}

export const TEMPLATE_LIST: TemplateMeta[] = [
  { id: 'idle_tycoon',     name: '💰 Idle Tycoon',     description: 'Basic idle game with gold production and upgrades',  category: 'Economy',  primaryResource: 'gold'   },
  { id: 'rpg_loot',        name: '⚔️ RPG Loot System', description: 'Loot drops with rarity chances',                    category: 'RPG',       primaryResource: 'loot'   },
  { id: 'resource_chain',  name: '🏭 Resource Chain',  description: 'Wood → Planks → Furniture production',               category: 'Strategy',  primaryResource: 'wood'   },
  { id: 'energy_system',   name: '⚡ Energy System',   description: 'Regenerating energy with actions',                   category: 'Mobile',    primaryResource: 'energy' },
  { id: 'gacha_pull',      name: '🎲 Gacha System',    description: 'Gacha pulls with rarity tiers',                      category: 'Mobile',    primaryResource: 'gems'   },
]

function baseGraph(name: string, partial: Pick<GSSGraph, 'nodes' | 'connections'>): GSSGraph {
  const now = new Date().toISOString()
  return {
    version: GSS_FORMAT_VERSION,
    tick_spec_version: TICK_SPEC_VERSION,
    name,
    description: '',
    created_at: now,
    modified_at: now,
    simulation_seed: 42,
    ...partial,
  }
}

// ==================== ŠABLONY ====================

function templateIdleTycoon(): GSSGraph {
  return baseGraph('Idle Tycoon', {
    nodes: [
      { id: 'gold_mine',    type: 1, label: 'Gold Mine',    position: { x: 50,  y: 100 }, data: { resource: 'gold', rate: 5.0 } },
      { id: 'gold_storage', type: 0, label: 'Gold Storage', position: { x: 300, y: 100 }, data: { resource: 'gold', capacity: 1000 } },
      { id: 'shop',         type: 3, label: 'Shop',         position: { x: 550, y: 100 }, data: { resource: 'gold', rate: 1.0 } },
    ],
    connections: [
      { from_node: 'gold_mine',    from_port: 0, to_node: 'gold_storage', to_port: 0 },
      { from_node: 'gold_storage', from_port: 0, to_node: 'shop',         to_port: 0 },
    ],
  })
}

function templateRpgLoot(): GSSGraph {
  return baseGraph('RPG Loot System', {
    nodes: [
      { id: 'monster_drop',  type: 1, label: 'Monster Drop',  position: { x: 50,  y: 150 }, data: { resource: 'loot', rate: 0.5 } },
      { id: 'rarity_roll',   type: 5, label: 'Rarity Roll',   position: { x: 250, y: 150 }, data: { success_chance: 20 } },
      { id: 'rare_items',    type: 0, label: 'Rare Items',    position: { x: 500, y:  50 }, data: { resource: 'rare',   capacity: 100 } },
      { id: 'common_items',  type: 0, label: 'Common Items',  position: { x: 500, y: 250 }, data: { resource: 'common', capacity: 500 } },
    ],
    connections: [
      { from_node: 'monster_drop', from_port: 0, to_node: 'rarity_roll',  to_port: 0 },
      { from_node: 'rarity_roll',  from_port: 0, to_node: 'rare_items',   to_port: 0 },
      { from_node: 'rarity_roll',  from_port: 1, to_node: 'common_items', to_port: 0 },
    ],
  })
}

function templateResourceChain(): GSSGraph {
  return baseGraph('Resource Chain', {
    nodes: [
      { id: 'forest',           type: 1, label: 'Forest',           position: { x:  50, y: 100 }, data: { resource: 'wood', rate: 2.0 } },
      { id: 'wood_storage',     type: 0, label: 'Wood Storage',     position: { x: 250, y: 100 }, data: { resource: 'wood',      capacity: 200 } },
      { id: 'sawmill',          type: 2, label: 'Sawmill',          position: { x: 450, y: 100 }, data: { input_resource: 'wood', input_amount: 2, output_resource: 'plank',     output_amount: 1, cycle_time: 3.0  } },
      { id: 'plank_storage',    type: 0, label: 'Plank Storage',    position: { x: 650, y: 100 }, data: { resource: 'plank',     capacity: 100 } },
      { id: 'workshop',         type: 2, label: 'Workshop',         position: { x: 450, y: 250 }, data: { input_resource: 'plank', input_amount: 3, output_resource: 'furniture', output_amount: 1, cycle_time: 10.0 } },
      { id: 'furniture_storage', type: 0, label: 'Furniture Store', position: { x: 650, y: 250 }, data: { resource: 'furniture', capacity:  50 } },
    ],
    connections: [
      { from_node: 'forest',        from_port: 0, to_node: 'wood_storage',      to_port: 0 },
      { from_node: 'wood_storage',  from_port: 0, to_node: 'sawmill',           to_port: 0 },
      { from_node: 'sawmill',       from_port: 0, to_node: 'plank_storage',     to_port: 0 },
      { from_node: 'plank_storage', from_port: 0, to_node: 'workshop',          to_port: 0 },
      { from_node: 'workshop',      from_port: 0, to_node: 'furniture_storage', to_port: 0 },
    ],
  })
}

function templateEnergySystem(): GSSGraph {
  return baseGraph('Energy System', {
    nodes: [
      { id: 'energy_regen', type: 1, label: 'Energy Regen', position: { x:  50, y: 100 }, data: { resource: 'energy', rate: 0.1 } },
      { id: 'energy_pool',  type: 0, label: 'Energy Pool',  position: { x: 250, y: 100 }, data: { resource: 'energy', capacity: 100 } },
      { id: 'action_gate',  type: 4, label: 'Action Gate',  position: { x: 450, y: 100 }, data: { variable: 'energy', operator: 1, value: 10 } },
      { id: 'action_cost',  type: 3, label: 'Action Cost',  position: { x: 650, y: 100 }, data: { resource: 'energy', rate: 10.0 } },
    ],
    connections: [
      { from_node: 'energy_regen', from_port: 0, to_node: 'energy_pool', to_port: 0 },
      { from_node: 'energy_pool',  from_port: 0, to_node: 'action_gate', to_port: 0 },
      { from_node: 'action_gate',  from_port: 0, to_node: 'action_cost', to_port: 0 },
    ],
  })
}

function templateGachaPull(): GSSGraph {
  return baseGraph('Gacha System', {
    nodes: [
      { id: 'gems_source', type: 1, label: 'Gems Source', position: { x:  50, y: 150 }, data: { resource: 'gems', rate: 0.0 } },
      { id: 'gems_pool',   type: 0, label: 'Gems Pool',   position: { x: 200, y: 150 }, data: { resource: 'gems', capacity: 10000 } },
      { id: 'pull_gate',   type: 4, label: 'Pull Gate',   position: { x: 350, y: 150 }, data: { variable: 'gems', operator: 1, value: 100 } },
      { id: 'ssr_chance',  type: 5, label: 'SSR Chance',  position: { x: 500, y: 100 }, data: { success_chance:  3 } },
      { id: 'sr_chance',   type: 5, label: 'SR Chance',   position: { x: 500, y: 250 }, data: { success_chance: 15 } },
      { id: 'ssr_pool',    type: 0, label: 'SSR Pool',    position: { x: 700, y:  50 }, data: { resource: 'SSR', capacity: 100  } },
      { id: 'sr_pool',     type: 0, label: 'SR Pool',     position: { x: 700, y: 150 }, data: { resource: 'SR',  capacity: 500  } },
      { id: 'r_pool',      type: 0, label: 'R Pool',      position: { x: 700, y: 300 }, data: { resource: 'R',   capacity: 1000 } },
    ],
    connections: [
      { from_node: 'pull_gate',  from_port: 0, to_node: 'ssr_chance', to_port: 0 },
      { from_node: 'ssr_chance', from_port: 0, to_node: 'ssr_pool',   to_port: 0 },
      { from_node: 'ssr_chance', from_port: 1, to_node: 'sr_chance',  to_port: 0 },
      { from_node: 'sr_chance',  from_port: 0, to_node: 'sr_pool',    to_port: 0 },
      { from_node: 'sr_chance',  from_port: 1, to_node: 'r_pool',     to_port: 0 },
    ],
  })
}

// ==================== PUBLIC API ====================

export function getTemplate(id: string): GSSGraph | null {
  switch (id) {
    case 'idle_tycoon':    return templateIdleTycoon()
    case 'rpg_loot':       return templateRpgLoot()
    case 'resource_chain': return templateResourceChain()
    case 'energy_system':  return templateEnergySystem()
    case 'gacha_pull':     return templateGachaPull()
    default:               return null
  }
}

export function getTemplateList(): TemplateMeta[] { return TEMPLATE_LIST }
