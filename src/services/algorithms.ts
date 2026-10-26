import {
  StartPoint,
  CenterPoint,
  TargetPoint,
  OptimizationMode,
  ModeMetric,
  FullDebugData,
  CenterDebugSummary,
  StartPointTripMetric,
} from '../types'
import { RoutingProvider } from './interfaces'
import { haversineDistance } from './providers/osrm-routing'

/**
 * Calculates the Geometric Median (Fermat-Weber point) of start points
 * using Weiszfeld's algorithm with Haversine air distance.
 */
export function computeAirDistanceCenter(startPoints: StartPoint[]): CenterPoint {
  if (startPoints.length === 0) {
    return { lat: 52.5200, lon: 13.4050, mode: 'air', label: 'Air Distance Center' }
  }
  if (startPoints.length === 1) {
    return { lat: startPoints[0].lat, lon: startPoints[0].lon, mode: 'air', label: 'Air Distance Center' }
  }

  // Initial guess: centroid (mean lat, mean lon)
  let curLat = startPoints.reduce((acc, p) => acc + p.lat, 0) / startPoints.length
  let curLon = startPoints.reduce((acc, p) => acc + p.lon, 0) / startPoints.length

  const maxIterations = 50
  const tolerance = 1e-6

  for (let iter = 0; iter < maxIterations; iter++) {
    let numLat = 0
    let numLon = 0
    let denom = 0

    let hitExact = false
    for (const p of startPoints) {
      const dist = Math.max(haversineDistance(curLat, curLon, p.lat, p.lon), 0.1) // avoid div by 0
      if (dist < 1) {
        hitExact = true
        break
      }
      const weight = 1 / dist
      numLat += p.lat * weight
      numLon += p.lon * weight
      denom += weight
    }

    if (hitExact || denom === 0) break

    const nextLat = numLat / denom
    const nextLon = numLon / denom

    const shift = Math.abs(nextLat - curLat) + Math.abs(nextLon - curLon)
    curLat = nextLat
    curLon = nextLon

    if (shift < tolerance) break
  }

  return {
    lat: curLat,
    lon: curLon,
    mode: 'air',
    label: 'Optimal Air Distance Center',
  }
}

/**
 * Computes a high-density, multi-geometry candidate set for center-finding:
 * 1. Air Distance Center (Geometric median Fermat-Weber point)
 * 2. Arithmetic Centroid
 * 3. Pairwise midpoints between all start points
 * 4. Pairwise trisections (1/3 and 2/3 along each pair)
 * 5. Intermediate points along lines between start-points and the Air Center
 * 6. Concentric rings around the Air Center (10%, 25%, 45% radius) in 8 directions
 */
export function generateCandidateGrid(
  startPoints: StartPoint[],
  airCenter?: { lat: number; lon: number }
): { lat: number; lon: number }[] {
  if (startPoints.length === 0) return []
  if (startPoints.length === 1) return [{ lat: startPoints[0].lat, lon: startPoints[0].lon }]

  const effectiveAir = airCenter || computeAirDistanceCenter(startPoints)
  const candidates: { lat: number; lon: number }[] = []
  const seen = new Set<string>()

  const add = (lat: number, lon: number) => {
    // Spatial rounding (~50m resolution key to prevent duplicate evaluations)
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
    if (!seen.has(key)) {
      seen.add(key)
      candidates.push({ lat, lon })
    }
  }

  // 1. Air Distance Center (Geometric median)
  add(effectiveAir.lat, effectiveAir.lon)

  // 2. Arithmetic Centroid
  const cLat = startPoints.reduce((acc, p) => acc + p.lat, 0) / startPoints.length
  const cLon = startPoints.reduce((acc, p) => acc + p.lon, 0) / startPoints.length
  add(cLat, cLon)

  // 3. Pairwise midpoints and trisections
  for (let i = 0; i < startPoints.length; i++) {
    for (let j = i + 1; j < startPoints.length; j++) {
      const p1 = startPoints[i]
      const p2 = startPoints[j]
      add((p1.lat + p2.lat) / 2, (p1.lon + p2.lon) / 2)
      add((2 * p1.lat + p2.lat) / 3, (2 * p1.lon + p2.lon) / 3)
      add((p1.lat + 2 * p2.lat) / 3, (p1.lon + 2 * p2.lon) / 3)
    }
  }

  // 4. Intermediate points towards Air Center
  for (const p of startPoints) {
    add(p.lat * 0.35 + effectiveAir.lat * 0.65, p.lon * 0.35 + effectiveAir.lon * 0.65)
    add(p.lat * 0.65 + effectiveAir.lat * 0.35, p.lon * 0.65 + effectiveAir.lon * 0.35)
  }

  // 5. Radial concentric rings around Air Center
  const avgDist =
    startPoints.reduce(
      (acc, p) => acc + haversineDistance(effectiveAir.lat, effectiveAir.lon, p.lat, p.lon),
      0
    ) / startPoints.length

  const radFractions = [0.10, 0.25, 0.45]
  const angles = [0, 45, 90, 135, 180, 225, 270, 315]

  for (const frac of radFractions) {
    const dMeters = avgDist * frac
    const dLat = dMeters / 111320
    const cosLat = Math.cos((effectiveAir.lat * Math.PI) / 180)
    for (const deg of angles) {
      const rad = (deg * Math.PI) / 180
      const dLon = dMeters / (111320 * cosLat)
      add(effectiveAir.lat + dLat * Math.sin(rad), effectiveAir.lon + dLon * Math.cos(rad))
    }
  }

  // shortcut: capped at 32 candidates to prevent OSRM 429 rate limits on public demo server, upgrade if using self-hosted OSRM
  if (candidates.length > 32) {
    const scored = candidates.map((c) => {
      const dists = startPoints.map((p) => haversineDistance(c.lat, c.lon, p.lat, p.lon))
      const mean = dists.reduce((a, b) => a + b, 0) / dists.length
      const variance = dists.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dists.length
      return { c, score: mean + 1.25 * Math.sqrt(variance) }
    })
    scored.sort((a, b) => a.score - b.score)
    return scored.slice(0, 32).map((item) => item.c)
  }

  return candidates
}

/**
 * Computes optimal Road Distance Center and Driving Time Center
 * using two-pass hierarchical routing matrix evaluation (global search + local refinement zoom)
 * with the average-trip + variance cap objective.
 */
export async function computeRoadAndDrivingCenters(
  startPoints: StartPoint[],
  routingProvider: RoutingProvider
): Promise<{
  roadCenter: CenterPoint
  timeCenter: CenterPoint
  engineSource?: 'osrm' | 'fallback'
}> {
  if (startPoints.length <= 1) {
    const defaultCenter = computeAirDistanceCenter(startPoints)
    return {
      roadCenter: { ...defaultCenter, mode: 'road', label: 'Optimal Road Center' },
      timeCenter: { ...defaultCenter, mode: 'time', label: 'Optimal Driving Time Center' },
      engineSource: 'fallback',
    }
  }

  const airCenter = computeAirDistanceCenter(startPoints)
  const origins = startPoints.map((p) => ({ lat: p.lat, lon: p.lon }))

  // Pass 1: Global multi-geometry candidate sweep
  const candidates = generateCandidateGrid(startPoints, airCenter)
  const matrix1 = await routingProvider.getDistanceMatrix(origins, candidates)

  const VARIANCE_PENALTY_WEIGHT = 1.25

  let bestRoadScore = Infinity
  let bestRoadIdx = 0
  let bestTimeScore = Infinity
  let bestTimeIdx = 0

  for (let c = 0; c < candidates.length; c++) {
    const candidateRoadDists: number[] = []
    const candidateTimes: number[] = []

    for (let o = 0; o < origins.length; o++) {
      candidateRoadDists.push(matrix1.roadDistances[o]?.[c] ?? 0)
      candidateTimes.push(matrix1.drivingTimes[o]?.[c] ?? 0)
    }

    const roadMetric = calculateMetricStats(candidateRoadDists)
    const roadScore = roadMetric.mean + VARIANCE_PENALTY_WEIGHT * roadMetric.stdDev
    if (roadScore < bestRoadScore) {
      bestRoadScore = roadScore
      bestRoadIdx = c
    }

    const timeMetric = calculateMetricStats(candidateTimes)
    const timeScore = timeMetric.mean + VARIANCE_PENALTY_WEIGHT * timeMetric.stdDev
    if (timeScore < bestTimeScore) {
      bestTimeScore = timeScore
      bestTimeIdx = c
    }
  }

  let finalRoadPoint = candidates[bestRoadIdx]
  let finalTimePoint = candidates[bestTimeIdx]

  // Pass 2: Local Refinement Zoom around best candidates
  const avgDist =
    startPoints.reduce(
      (acc, p) => acc + haversineDistance(airCenter.lat, airCenter.lon, p.lat, p.lon),
      0
    ) / startPoints.length

  if (avgDist > 3000) {
    const refineDistMeters = Math.max(avgDist * 0.08, 1200)
    const refinePoints: { lat: number; lon: number; targetMode: 'road' | 'time' }[] = []

    const generateLocalRing = (center: { lat: number; lon: number }, mode: 'road' | 'time') => {
      const angles = [0, 45, 90, 135, 180, 225, 270, 315]
      const cosLat = Math.cos((center.lat * Math.PI) / 180)
      for (const frac of [0.4, 0.9]) {
        const d = refineDistMeters * frac
        const dLat = d / 111320
        for (const deg of angles) {
          const rad = (deg * Math.PI) / 180
          const dLon = d / (111320 * cosLat)
          refinePoints.push({
            lat: center.lat + dLat * Math.sin(rad),
            lon: center.lon + dLon * Math.cos(rad),
            targetMode: mode,
          })
        }
      }
    }

    generateLocalRing(finalRoadPoint, 'road')
    generateLocalRing(finalTimePoint, 'time')

    try {
      const matrix2 = await routingProvider.getDistanceMatrix(origins, refinePoints)

      for (let c = 0; c < refinePoints.length; c++) {
        const candidateRoadDists: number[] = []
        const candidateTimes: number[] = []

        for (let o = 0; o < origins.length; o++) {
          candidateRoadDists.push(matrix2.roadDistances[o]?.[c] ?? 0)
          candidateTimes.push(matrix2.drivingTimes[o]?.[c] ?? 0)
        }

        if (refinePoints[c].targetMode === 'road') {
          const roadMetric = calculateMetricStats(candidateRoadDists)
          const roadScore = roadMetric.mean + VARIANCE_PENALTY_WEIGHT * roadMetric.stdDev
          if (roadScore < bestRoadScore) {
            bestRoadScore = roadScore
            finalRoadPoint = { lat: refinePoints[c].lat, lon: refinePoints[c].lon }
          }
        }

        if (refinePoints[c].targetMode === 'time') {
          const timeMetric = calculateMetricStats(candidateTimes)
          const timeScore = timeMetric.mean + VARIANCE_PENALTY_WEIGHT * timeMetric.stdDev
          if (timeScore < bestTimeScore) {
            bestTimeScore = timeScore
            finalTimePoint = { lat: refinePoints[c].lat, lon: refinePoints[c].lon }
          }
        }
      }
    } catch (refineErr) {
      console.warn('Refinement pass skipped:', refineErr)
    }
  }

  return {
    roadCenter: {
      lat: finalRoadPoint.lat,
      lon: finalRoadPoint.lon,
      mode: 'road',
      label: 'Optimal Road Distance Center',
      score: bestRoadScore,
    },
    timeCenter: {
      lat: finalTimePoint.lat,
      lon: finalTimePoint.lon,
      mode: 'time',
      label: 'Optimal Driving Time Center',
      score: bestTimeScore,
    },
    engineSource: matrix1.source || 'osrm',
  }
}

/**
 * Calculates statistical metrics (mean, variance, stdDev, min, max) for an array of values.
 */
export function calculateMetricStats(values: number[]): Omit<ModeMetric, 'qualifies'> {
  if (values.length === 0) {
    return { mean: 0, variance: 0, stdDev: 0, min: 0, max: 0, individual: [] }
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)
  const min = Math.min(...values)
  const max = Math.max(...values)

  return {
    mean,
    variance,
    stdDev,
    min,
    max,
    individual: values,
  }
}

/**
 * Evaluates target-points across all 3 modes:
 * Computes individual travel costs from each start point,
 * evaluates group fairness metrics (mean + variance cap),
 * and determines mode qualification for the tripartite shield indicator.
 */
export async function evaluateTargetPoints(
  startPoints: StartPoint[],
  targetPoints: TargetPoint[],
  routingProvider: RoutingProvider,
  primaryMode: OptimizationMode
): Promise<TargetPoint[]> {
  if (targetPoints.length === 0) return []
  if (startPoints.length === 0) return targetPoints

  const origins = startPoints.map((p) => ({ lat: p.lat, lon: p.lon }))
  const destinations = targetPoints.map((t) => ({ lat: t.lat, lon: t.lon }))

  // 1. Calculate Air distances for all targets (instant Haversine)
  for (const target of targetPoints) {
    const airDists = startPoints.map((p) =>
      haversineDistance(p.lat, p.lon, target.lat, target.lon)
    )
    const stats = calculateMetricStats(airDists)
    target.metrics.air = { ...stats, qualifies: false }
  }

  // 2. Calculate Road & Driving Times via Routing Provider
  const matrix = await routingProvider.getDistanceMatrix(origins, destinations)

  for (let t = 0; t < targetPoints.length; t++) {
    const roadDists: number[] = []
    const driveTimes: number[] = []

    for (let o = 0; o < origins.length; o++) {
      roadDists.push(matrix.roadDistances[o]?.[t] ?? 0)
      driveTimes.push(matrix.drivingTimes[o]?.[t] ?? 0)
    }

    const roadStats = calculateMetricStats(roadDists)
    const timeStats = calculateMetricStats(driveTimes)

    targetPoints[t].metrics.road = { ...roadStats, qualifies: false }
    targetPoints[t].metrics.time = { ...timeStats, qualifies: false }
  }

  // 3. Multi-Mode Qualification Evaluation
  // Find minimum score achieved for each mode
  const VARIANCE_PENALTY_WEIGHT = 1.25

  const airScores = targetPoints.map(
    (t) => t.metrics.air.mean + VARIANCE_PENALTY_WEIGHT * t.metrics.air.stdDev
  )
  const roadScores = targetPoints.map(
    (t) => t.metrics.road.mean + VARIANCE_PENALTY_WEIGHT * t.metrics.road.stdDev
  )
  const timeScores = targetPoints.map(
    (t) => t.metrics.time.mean + VARIANCE_PENALTY_WEIGHT * t.metrics.time.stdDev
  )

  const minAirScore = Math.min(...airScores)
  const minRoadScore = Math.min(...roadScores)
  const minTimeScore = Math.min(...timeScores)

  // Acceptance threshold: within 25% of the best score for that mode,
  // and variance does not exceed 1.8x the mean (strict variance fairness cap)
  const QUALIFICATION_BAND = 1.25

  targetPoints.forEach((target, idx) => {
    const airScore = airScores[idx]
    const roadScore = roadScores[idx]
    const timeScore = timeScores[idx]

    // Mode 1: Air Distance qualification
    const airFair = target.metrics.air.stdDev <= target.metrics.air.mean * 1.5
    target.metrics.air.qualifies = airScore <= minAirScore * QUALIFICATION_BAND && airFair

    // Mode 2: Road Distance qualification
    const roadFair = target.metrics.road.stdDev <= target.metrics.road.mean * 1.5
    target.metrics.road.qualifies = roadScore <= minRoadScore * QUALIFICATION_BAND && roadFair

    // Mode 3: Driving Time qualification
    const timeFair = target.metrics.time.stdDev <= target.metrics.time.mean * 1.5
    target.metrics.time.qualifies = timeScore <= minTimeScore * QUALIFICATION_BAND && timeFair

    // Ensure the top absolute best place for each mode always qualifies for that mode
    if (airScore === minAirScore) target.metrics.air.qualifies = true
    if (roadScore === minRoadScore) target.metrics.road.qualifies = true
    if (timeScore === minTimeScore) target.metrics.time.qualifies = true

    // Overall composite score (normalized 0-100, where 100 is best)
    // Primary user-selected mode gets 60% weight, other modes 20% each
    const normAir = minAirScore / Math.max(airScore, 1)
    const normRoad = minRoadScore / Math.max(roadScore, 1)
    const normTime = minTimeScore / Math.max(timeScore, 1)

    let weightAir = 0.2, weightRoad = 0.2, weightTime = 0.2
    if (primaryMode === 'air') weightAir = 0.6
    else if (primaryMode === 'road') weightRoad = 0.6
    else if (primaryMode === 'time') weightTime = 0.6
    else if (primaryMode === 'manual') {
      weightAir = 0.34
      weightRoad = 0.33
      weightTime = 0.33
    }

    target.compositeScore = Math.round(
      (normAir * weightAir + normRoad * weightRoad + normTime * weightTime) * 100
    )
  })

  // Sort descending by composite score
  return targetPoints.sort((a, b) => b.compositeScore - a.compositeScore)
}

/**
 * Computes complete diagnostics and metric breakdowns from all start-points
 * to the three centers (Air, Road, Driving Time).
 */
export async function computeFullDebugMetrics(
  startPoints: StartPoint[],
  centers: {
    air: CenterPoint | null
    road: CenterPoint | null
    time: CenterPoint | null
    manual?: CenterPoint | null
  },
  routingProvider: RoutingProvider
): Promise<FullDebugData> {
  const activeCentersList: { center: CenterPoint; key: 'air' | 'road' | 'time' | 'manual' }[] = []
  if (centers.air) activeCentersList.push({ center: centers.air, key: 'air' })
  if (centers.road) activeCentersList.push({ center: centers.road, key: 'road' })
  if (centers.time) activeCentersList.push({ center: centers.time, key: 'time' })
  if (centers.manual) activeCentersList.push({ center: centers.manual, key: 'manual' })

  const origins = startPoints.map((p) => ({ lat: p.lat, lon: p.lon }))
  const destinations = activeCentersList.map((c) => ({ lat: c.center.lat, lon: c.center.lon }))

  let matrixResult: { roadDistances: number[][]; drivingTimes: number[][]; source?: 'osrm' | 'fallback' } = {
    roadDistances: [],
    drivingTimes: [],
    source: 'fallback',
  }

  if (origins.length > 0 && destinations.length > 0) {
    try {
      matrixResult = await routingProvider.getDistanceMatrix(origins, destinations)
    } catch (err) {
      console.warn('Failed computing debug matrix:', err)
    }
  }

  const engineSource = matrixResult.source || 'osrm'

  const summaries: Record<'air' | 'road' | 'time' | 'manual', CenterDebugSummary | null> = {
    air: null,
    road: null,
    time: null,
    manual: null,
  }

  const VARIANCE_PENALTY_WEIGHT = 1.25

  for (let destIdx = 0; destIdx < activeCentersList.length; destIdx++) {
    const { center, key } = activeCentersList[destIdx]
    const trips: StartPointTripMetric[] = []
    const roadDists: number[] = []
    const times: number[] = []
    const airDists: number[] = []

    for (let oIdx = 0; oIdx < startPoints.length; oIdx++) {
      const sp = startPoints[oIdx]
      const airDist = haversineDistance(sp.lat, sp.lon, center.lat, center.lon)
      const roadDist = matrixResult.roadDistances[oIdx]?.[destIdx] ?? airDist * 1.3
      const driveTime = matrixResult.drivingTimes[oIdx]?.[destIdx] ?? Math.round(roadDist / 20)

      trips.push({
        startPointId: sp.id,
        startPointName: sp.name,
        color: sp.color,
        airDistanceMeters: airDist,
        roadDistanceMeters: roadDist,
        drivingTimeSeconds: driveTime,
      })

      airDists.push(airDist)
      roadDists.push(roadDist)
      times.push(driveTime)
    }

    const airStats = calculateMetricStats(airDists)
    const roadStats = calculateMetricStats(roadDists)
    const timeStats = calculateMetricStats(times)

    summaries[key] = {
      center,
      attendeeTrips: trips,
      stats: {
        airDistance: {
          mean: airStats.mean,
          stdDev: airStats.stdDev,
          min: airStats.min,
          max: airStats.max,
        },
        roadDistance: {
          mean: roadStats.mean,
          stdDev: roadStats.stdDev,
          min: roadStats.min,
          max: roadStats.max,
          score: roadStats.mean + VARIANCE_PENALTY_WEIGHT * roadStats.stdDev,
        },
        drivingTime: {
          mean: timeStats.mean,
          stdDev: timeStats.stdDev,
          min: timeStats.min,
          max: timeStats.max,
          score: timeStats.mean + VARIANCE_PENALTY_WEIGHT * timeStats.stdDev,
        },
      },
      engineSource,
    }
  }

  // Build per-attendee matrix rows
  const matrixRows = startPoints.map((sp) => {
    const airTrip = summaries.air?.attendeeTrips.find((t) => t.startPointId === sp.id)
    const roadTrip = summaries.road?.attendeeTrips.find((t) => t.startPointId === sp.id)
    const timeTrip = summaries.time?.attendeeTrips.find((t) => t.startPointId === sp.id)
    const manualTrip = summaries.manual?.attendeeTrips.find((t) => t.startPointId === sp.id)

    return {
      startPointId: sp.id,
      startPointName: sp.name,
      color: sp.color,
      airCenter: airTrip
        ? {
            airMeters: airTrip.airDistanceMeters,
            roadMeters: airTrip.roadDistanceMeters,
            timeSeconds: airTrip.drivingTimeSeconds,
          }
        : null,
      roadCenter: roadTrip
        ? {
            airMeters: roadTrip.airDistanceMeters,
            roadMeters: roadTrip.roadDistanceMeters,
            timeSeconds: roadTrip.drivingTimeSeconds,
          }
        : null,
      timeCenter: timeTrip
        ? {
            airMeters: timeTrip.airDistanceMeters,
            roadMeters: timeTrip.roadDistanceMeters,
            timeSeconds: timeTrip.drivingTimeSeconds,
          }
        : null,
      manualCenter: manualTrip
        ? {
            airMeters: manualTrip.airDistanceMeters,
            roadMeters: manualTrip.roadDistanceMeters,
            timeSeconds: manualTrip.drivingTimeSeconds,
          }
        : null,
    }
  })

  return {
    startPoints,
    centers: summaries,
    matrix: matrixRows,
    lastUpdated: new Date(),
  }
}

