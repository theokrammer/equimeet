export type OptimizationMode = 'air' | 'road' | 'time' | 'manual'

export interface StartPoint {
  id: string
  name: string
  lat: number
  lon: number
  color: string
}

export interface CenterPoint {
  lat: number
  lon: number
  mode: OptimizationMode
  label: string
  score?: number
}

export interface ModeMetric {
  mean: number         // meters for air/road, seconds for driving time
  variance: number     // variance among participants
  stdDev: number       // standard deviation
  max: number          // longest trip for any single participant
  min: number          // shortest trip for any single participant
  individual: number[] // values per participant in order of startPoints
  qualifies: boolean   // whether this target satisfies this mode's criteria
}

export interface TargetPoint {
  id: string
  name: string
  category: string
  lat: number
  lon: number
  
  // Normalized metadata
  address?: string
  phone?: string
  website?: string
  
  // Unified opening hours structure
  openingHours?: {
    isOpenNow?: boolean
    weekdayText?: string[]
    raw?: string
  }

  // Future Google Maps / Places enrichment slots (deferred)
  googlePlaceId?: string
  rating?: number
  userRatingCount?: number
  photoUrl?: string
  googleMapsUrl?: string

  // Multi-mode scoring metrics
  metrics: {
    air: ModeMetric
    road: ModeMetric
    time: ModeMetric
  }

  compositeScore: number
}

export const MODE_COLORS: Record<OptimizationMode, string> = {
  air: '#0284c7',   // Sky Blue
  road: '#059669',  // High-contrast vibrant Emerald / Sea Green
  time: '#ea580c',  // Amber / Warm Orange
  manual: '#8b5cf6', // Violet / Purple (Visually distinct from the tri-shield colors)
}

export const MODE_LABELS: Record<OptimizationMode, string> = {
  air: 'Minimal Air Distance',
  road: 'Minimal Road Distance',
  time: 'Minimal Driving Time',
  manual: 'Manual Center Point',
}

export const MODE_DESCRIPTIONS: Record<OptimizationMode, string> = {
  air: 'Bird-flight geometric center minimizing straight-line travel',
  road: 'Optimal point on street network minimizing actual road distance',
  time: 'Fastest arrival center minimizing travel duration taking speeds into account',
  manual: 'Custom user-defined center point on the map for targeted meetup searches',
}

export interface CategoryPreset {
  id: string
  label: string
  icon: string
  osmQuery: string
}

export const CATEGORY_PRESETS: CategoryPreset[] = [
  { id: 'playground', label: 'Playground', icon: 'Smile', osmQuery: 'leisure=playground' },
  { id: 'restaurant', label: 'Restaurant', icon: 'Utensils', osmQuery: 'amenity=restaurant|fast_food|food_court' },
  { id: 'cafe', label: 'Café', icon: 'Coffee', osmQuery: 'amenity=cafe' },
  { id: 'swimming_pool', label: 'Swimming Pool', icon: 'Waves', osmQuery: 'leisure=swimming_pool|water_park' },
  { id: 'park', label: 'Park', icon: 'Trees', osmQuery: 'leisure=park' },
]

export const START_POINT_COLORS = [
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
]

export interface StartPointTripMetric {
  startPointId: string
  startPointName: string
  color: string
  airDistanceMeters: number
  roadDistanceMeters: number
  drivingTimeSeconds: number
}

export interface CenterDebugSummary {
  center: CenterPoint
  attendeeTrips: StartPointTripMetric[]
  stats: {
    roadDistance: {
      mean: number
      stdDev: number
      min: number
      max: number
      score: number
    }
    drivingTime: {
      mean: number
      stdDev: number
      min: number
      max: number
      score: number
    }
    airDistance: {
      mean: number
      stdDev: number
      min: number
      max: number
    }
  }
  engineSource: 'osrm' | 'fallback'
}

export interface FullDebugData {
  startPoints: StartPoint[]
  centers: {
    air: CenterDebugSummary | null
    road: CenterDebugSummary | null
    time: CenterDebugSummary | null
    manual?: CenterDebugSummary | null
  }
  matrix: {
    startPointId: string
    startPointName: string
    color: string
    airCenter: { airMeters: number; roadMeters: number; timeSeconds: number } | null
    roadCenter: { airMeters: number; roadMeters: number; timeSeconds: number } | null
    timeCenter: { airMeters: number; roadMeters: number; timeSeconds: number } | null
    manualCenter?: { airMeters: number; roadMeters: number; timeSeconds: number } | null
  }[]
  lastUpdated: Date
}

