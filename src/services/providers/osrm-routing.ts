import { RoutingProvider } from '../interfaces'

// Haversine formula for air distance in meters
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export class OsrmRoutingProvider implements RoutingProvider {
  private baseUrl = 'https://router.project-osrm.org/table/v1/driving'

  /**
   * Calculates driving distance matrix (meters) and duration matrix (seconds)
   * between origins and destinations.
   */
  async getDistanceMatrix(
    origins: { lat: number; lon: number }[],
    destinations: { lat: number; lon: number }[]
  ): Promise<{
    roadDistances: number[][]
    drivingTimes: number[][]
    source?: 'osrm' | 'fallback'
  }> {
    if (origins.length === 0 || destinations.length === 0) {
      return { roadDistances: [], drivingTimes: [], source: 'osrm' }
    }

    try {
      // Chunk destinations to avoid URL length limitations (max ~25 destinations per batch)
      const CHUNK_SIZE = 25
      const allDistances: number[][] = origins.map(() => [])
      const allTimes: number[][] = origins.map(() => [])

      for (let i = 0; i < destinations.length; i += CHUNK_SIZE) {
        const destChunk = destinations.slice(i, i + CHUNK_SIZE)
        const coords = [...origins, ...destChunk]
          .map((pt) => `${pt.lon.toFixed(6)},${pt.lat.toFixed(6)}`)
          .join(';')

        const sources = origins.map((_, idx) => idx).join(';')
        const destIndices = destChunk
          .map((_, idx) => origins.length + idx)
          .join(';')

        const url = `${this.baseUrl}/${coords}?sources=${sources}&destinations=${destIndices}&annotations=duration,distance`

        const res = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!res.ok) {
          throw new Error(`OSRM HTTP status ${res.status}`)
        }

        const data = await res.json()
        if (data.code !== 'Ok' || !data.distances || !data.durations) {
          throw new Error(`OSRM error code: ${data.code}`)
        }

        // Append chunk results
        for (let originIdx = 0; originIdx < origins.length; originIdx++) {
          const distRow = data.distances[originIdx] || []
          const timeRow = data.durations[originIdx] || []

          for (let cIdx = 0; cIdx < destChunk.length; cIdx++) {
            // Null or 0 fallback
            const d = distRow[cIdx] != null ? distRow[cIdx] : this.estimateRoadDist(origins[originIdx], destChunk[cIdx])
            const t = timeRow[cIdx] != null ? timeRow[cIdx] : this.estimateDrivingTime(d)
            allDistances[originIdx].push(d)
            allTimes[originIdx].push(t)
          }
        }
      }

      return {
        roadDistances: allDistances,
        drivingTimes: allTimes,
        source: 'osrm' as const,
      }
    } catch (err) {
      console.warn('OSRM matrix request failed, using intelligent geometric estimation fallback:', err)
      return this.fallbackEstimates(origins, destinations)
    }
  }

  private estimateRoadDist(origin: { lat: number; lon: number }, dest: { lat: number; lon: number }): number {
    const air = haversineDistance(origin.lat, origin.lon, dest.lat, dest.lon)
    // Non-linear road detour factor based on distance:
    // Short trips (urban/suburban) have frequent turns and detours (~1.40x)
    // Medium regional trips follow state highways (~1.30x)
    // Long trips use straighter motorways/highways (~1.22x)
    const detourFactor = air < 20000 ? 1.40 : air < 70000 ? 1.30 : 1.22
    return air * detourFactor
  }

  private estimateDrivingTime(roadMeters: number): number {
    // Distance-dependent speed curve reflecting realistic road hierarchy:
    // Short trips (< 15 km): Urban / local speeds ~38 km/h (10.5 m/s)
    // Medium trips (15 - 60 km): Regional B-roads ~68 km/h (18.9 m/s)
    // Long trips (> 60 km): Autobahn / highway cruising ~108 km/h (30.0 m/s)
    if (roadMeters < 15000) {
      return Math.round(roadMeters / 10.5)
    } else if (roadMeters < 60000) {
      return Math.round(roadMeters / 18.9)
    } else {
      // Blended tiered speed:
      // First 15km urban (15000 / 10.5 = 1429s)
      // Next 45km regional (45000 / 18.9 = 2381s)
      // Remaining distance at highway speed (rest / 30.0s)
      const highwayMeters = roadMeters - 60000
      return Math.round(1429 + 2381 + highwayMeters / 30.0)
    }
  }

  private fallbackEstimates(
    origins: { lat: number; lon: number }[],
    destinations: { lat: number; lon: number }[]
  ): { roadDistances: number[][]; drivingTimes: number[][]; source: 'fallback' } {
    const roadDistances: number[][] = []
    const drivingTimes: number[][] = []

    for (let o = 0; o < origins.length; o++) {
      roadDistances[o] = []
      drivingTimes[o] = []
      for (let d = 0; d < destinations.length; d++) {
        const dist = this.estimateRoadDist(origins[o], destinations[d])
        const time = this.estimateDrivingTime(dist)
        roadDistances[o].push(dist)
        drivingTimes[o].push(time)
      }
    }

    return { roadDistances, drivingTimes, source: 'fallback' }
  }
}
