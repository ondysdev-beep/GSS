// BaseAnalyzer.ts — port GDScript BaseAnalyzer.gd
// Základní rozhraní a pomocné funkce pro všechny analyzátory systémů.

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type HealthRating  = 'RED' | 'YELLOW' | 'GREEN' | 'DIAMOND'

export interface AnalysisIssue {
  title: string
  description: string
  severity: IssueSeverity
  node_id: string
}

export interface AnalysisRecommendation {
  reason: string
  parameter: string
  current_value: number
  recommended_value: number
  priority: number      // 1 = highest
  confidence: number    // 0–1
}

export interface AnalysisReport {
  analyzer_type: string
  health_score: Record<string, unknown>
  issues: AnalysisIssue[]
  recommendations: AnalysisRecommendation[]
  quick_stats: Record<string, unknown>
  confidence: number
  analysis_time: number
}

// ==================== UTILITY FUNCTIONS ====================

export function createIssue(
  title: string,
  description: string,
  severity: IssueSeverity,
  nodeId = '',
): AnalysisIssue {
  return { title, description, severity, node_id: nodeId }
}

export function createRecommendation(
  reason: string,
  parameter: string,
  currentValue: number,
  recommendedValue: number,
  priority = 3,
  confidence = 0.7,
): AnalysisRecommendation {
  return { reason, parameter, current_value: currentValue, recommended_value: recommendedValue, priority, confidence }
}

export function calculateRating(score: number): HealthRating {
  if (score < 40)  return 'RED'
  if (score < 70)  return 'YELLOW'
  if (score < 85)  return 'GREEN'
  return 'DIAMOND'
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value))
}
