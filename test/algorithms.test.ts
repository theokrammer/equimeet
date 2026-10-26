import {
  computeAirDistanceCenter,
  calculateMetricStats,
  evaluateTargetPoints,
} from '../src/services/algorithms.ts'
import { StartPoint, TargetPoint, OptimizationMode } from '../src/types/index.ts'
import { RoutingProvider } from '../src/services/interfaces.ts'
import { haversineDistance } from '../src/services/providers/osrm-routing.ts'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${msg}`)
    process.exit(1)
  }
  console.log(`✅ Passed: ${msg}`)
}

console.log('--- Testing Algorithms & Domain Models ---')

// 1. Test Haversine Distance
const distBerlinAlexToCharlottenburg = haversineDistance(52.5219, 13.4132, 52.5206, 13.2956)
assert(distBerlinAlexToCharlottenburg > 7000 && distBerlinAlexToCharlottenburg < 9000,
  `Haversine distance Alex -> Charlottenburg should be ~8km (got ${Math.round(distBerlinAlexToCharlottenburg)}m)`)

// 2. Test Weiszfeld Geometric Median
const testStartPoints: StartPoint[] = [
  { id: '1', name: 'A', lat: 52.50, lon: 13.30, color: '#ff0000' },
  { id: '2', name: 'B', lat: 52.50, lon: 13.50, color: '#00ff00' },
  { id: '3', name: 'C', lat: 52.60, lon: 13.40, color: '#0000ff' },
]

const airCenter = computeAirDistanceCenter(testStartPoints)
assert(airCenter.lat > 52.51 && airCenter.lat < 52.55, `Air center lat should be inside triangle (~52.53), got ${airCenter.lat}`)
assert(airCenter.lon > 13.38 && airCenter.lon < 13.42, `Air center lon should be near 13.40, got ${airCenter.lon}`)

// 3. Test Statistical Stats
const stats = calculateMetricStats([1000, 2000, 3000])
assert(stats.mean === 2000, `Mean should be 2000 (got ${stats.mean})`)
assert(stats.min === 1000, `Min should be 1000`)
assert(stats.max === 3000, `Max should be 3000`)
assert(Math.round(stats.stdDev) === 816, `StdDev should be ~816 (got ${Math.round(stats.stdDev)})`)

// 4. Test Multi-Mode Qualification Evaluation
const mockRoutingProvider: RoutingProvider = {
  async getDistanceMatrix(origins, destinations) {
    return {
      roadDistances: [
        [3000, 10000],
        [3200, 2000],
        [3100, 12000],
      ],
      drivingTimes: [
        [300, 1200],
        [320, 240],
        [310, 1400],
      ],
    }
  },
}

const mockTargets: TargetPoint[] = [
  {
    id: 't-1',
    name: 'Balanced Meetup Point',
    category: 'Restaurant',
    lat: 52.53,
    lon: 13.40,
    metrics: {
      air: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
      road: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
      time: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
    },
    compositeScore: 0,
  },
  {
    id: 't-2',
    name: 'Unfair Skewed Point',
    category: 'Park',
    lat: 52.50,
    lon: 13.52,
    metrics: {
      air: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
      road: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
      time: { mean: 0, variance: 0, stdDev: 0, max: 0, min: 0, individual: [], qualifies: false },
    },
    compositeScore: 0,
  },
]

async function testEvaluation() {
  const evaluated = await evaluateTargetPoints(testStartPoints, mockTargets, mockRoutingProvider, 'time')
  
  assert(evaluated.length === 2, 'Should evaluate both target points')
  assert(evaluated[0].id === 't-1', 'Balanced point t-1 should rank #1 due to low variance')
  assert(evaluated[0].metrics.time.qualifies === true, 'Balanced point should qualify for time mode')
  assert(evaluated[0].metrics.road.qualifies === true, 'Balanced point should qualify for road mode')
  assert(evaluated[0].compositeScore > evaluated[1].compositeScore, 'Balanced point compositeScore should be higher than skewed point')

  // 5. Test Center Computation & Candidate Generation
  const { computeRoadAndDrivingCenters, computeFullDebugMetrics, generateCandidateGrid } = await import('../src/services/algorithms.ts')
  const candidates = generateCandidateGrid(testStartPoints)
  assert(candidates.length >= 25, `Candidate grid should generate at least 25 points (got ${candidates.length})`)

  const centers = await computeRoadAndDrivingCenters(testStartPoints, mockRoutingProvider)
  assert(centers.roadCenter.lat > 52.4 && centers.roadCenter.lat < 52.7, 'Road center should be within triangle bounds')
  assert(centers.timeCenter.lat > 52.4 && centers.timeCenter.lat < 52.7, 'Time center should be within triangle bounds')

  // 6. Test Debug Metrics Matrix Calculation (with Manual Center)
  const manualCenterPoint = {
    lat: 52.53,
    lon: 13.40,
    mode: 'manual' as const,
    label: 'Custom Meetup Venue',
  }

  const debugData = await computeFullDebugMetrics(
    testStartPoints,
    {
      air: airCenter,
      road: centers.roadCenter,
      time: centers.timeCenter,
      manual: manualCenterPoint,
    },
    mockRoutingProvider
  )
  assert(debugData.matrix.length === 3, 'Matrix should have 3 rows for 3 start points')
  assert(debugData.centers.road !== null, 'Road center summary should exist')
  assert(debugData.centers.time !== null, 'Time center summary should exist')
  assert(debugData.centers.manual !== null && debugData.centers.manual !== undefined, 'Manual center summary should exist in debug metrics')
  assert(debugData.matrix[0].roadCenter !== null, 'Attendee 1 should have roadCenter trip data')
  assert(debugData.matrix[0].roadCenter!.roadMeters > 0, 'Road meters should be positive')
  assert(debugData.matrix[0].manualCenter !== null && debugData.matrix[0].manualCenter !== undefined, 'Attendee 1 should have manualCenter trip data')

  // 7. Test Evaluation with primaryMode: 'manual'
  const manualEvaluated = await evaluateTargetPoints(testStartPoints, mockTargets, mockRoutingProvider, 'manual')
  assert(manualEvaluated.length === 2, 'Should evaluate both target points for manual mode')
  assert(manualEvaluated[0].compositeScore > 0, 'Composite score should be calculated in manual mode')

  // 8. Test OSRM Routing Provider (Empty handling & non-linear distance estimation)
  const { OsrmRoutingProvider } = await import('../src/services/providers/osrm-routing.ts')
  const osrm = new OsrmRoutingProvider()
  const emptyRes = await osrm.getDistanceMatrix([], [])
  assert(emptyRes.roadDistances.length === 0, 'Empty matrix returns empty array')

  // 9. Test Candidate Grid Capping (Max 32 to prevent OSRM HTTP 429)
  const manyAttendees: StartPoint[] = [
    { id: '1', name: 'A', lat: 52.50, lon: 13.30, color: '#1' },
    { id: '2', name: 'B', lat: 52.50, lon: 13.50, color: '#2' },
    { id: '3', name: 'C', lat: 52.60, lon: 13.40, color: '#3' },
    { id: '4', name: 'D', lat: 52.40, lon: 13.40, color: '#4' },
    { id: '5', name: 'E', lat: 52.55, lon: 13.35, color: '#5' },
    { id: '6', name: 'F', lat: 52.45, lon: 13.45, color: '#6' },
  ]
  const cappedGrid = generateCandidateGrid(manyAttendees)
  assert(cappedGrid.length <= 32, `Candidate grid for 6 attendees must be capped at <= 32 points to avoid OSRM 429 (got ${cappedGrid.length})`)
  assert(cappedGrid.length >= 25, `Capped grid still provides high resolution (got ${cappedGrid.length})`)

  console.log(`\n🎉 All unit verification tests passed successfully!`)
}

testEvaluation().catch((err) => {
  console.error(err)
  process.exit(1)
})

