<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  StartPoint,
  CenterPoint,
  TargetPoint,
  OptimizationMode,
  START_POINT_COLORS,
  MODE_COLORS,
  MODE_LABELS,
  FullDebugData,
} from './types'
import { OsmGeocodingProvider } from './services/providers/osm-geocoding'
import { OsrmRoutingProvider } from './services/providers/osrm-routing'
import { OverpassPoiProvider } from './services/providers/overpass-poi'
import {
  computeAirDistanceCenter,
  computeRoadAndDrivingCenters,
  evaluateTargetPoints,
  computeFullDebugMetrics,
} from './services/algorithms'

import MapView from './components/MapView.vue'
import StartPointsPanel from './components/StartPointsPanel.vue'
import SearchControls from './components/SearchControls.vue'
import TargetPointsList from './components/TargetPointsList.vue'
import TriShieldIcon from './components/TriShieldIcon.vue'
import DebugPanel from './components/DebugPanel.vue'
import {
  Compass,
  MapPin,
  ListFilter,
  Sliders,
  Sparkles,
  Info,
  Loader2,
  Trash2,
  Activity,
} from 'lucide-vue-next'

// Active Provider Instances (Pluggable via Adapter Pattern)
const geocodingProvider = new OsmGeocodingProvider()
const routingProvider = new OsrmRoutingProvider()
const targetPointProvider = new OverpassPoiProvider()

// Reactive State
const startPoints = ref<StartPoint[]>([])
const activeMode = ref<OptimizationMode>('air')
const radiusKm = ref<number>(5)
const selectedCategory = ref<string>('playground')
const customQuery = ref<string>('')

const airCenter = ref<CenterPoint | null>(null)
const roadCenter = ref<CenterPoint | null>(null)
const timeCenter = ref<CenterPoint | null>(null)
const manualCenter = ref<CenterPoint | null>(null)

// Flag when user is actively clicking the map to reposition the manual center
const isSettingManualCenter = ref<boolean>(false)

// Simultaneous Center Visibility Flags
const visibleCenters = ref<{ air: boolean; road: boolean; time: boolean; manual: boolean }>({
  air: true,
  road: true,
  time: true,
  manual: true,
})

// Loading states for center calculation
const isCalculatingCenters = ref<{ air: boolean; road: boolean; time: boolean }>({
  air: false,
  road: false,
  time: false,
})

const targetPoints = ref<TargetPoint[]>([])
const selectedTargetId = ref<string | null>(null)
const isSearching = ref(false)
const activeTab = ref<'setup' | 'results'>('setup')

// Debug & Metrics Panel State
const showDebugPanel = ref(false)
const debugData = ref<FullDebugData | null>(null)

const mapViewRef = ref<InstanceType<typeof MapView> | null>(null)

// Current active center based on selected mode
const activeCenter = computed(() => {
  if (activeMode.value === 'air') return airCenter.value
  if (activeMode.value === 'road') return roadCenter.value
  if (activeMode.value === 'time') return timeCenter.value
  if (activeMode.value === 'manual') return manualCenter.value
  return airCenter.value
})

const allCenters = computed(() => ({
  air: airCenter.value,
  road: roadCenter.value,
  time: timeCenter.value,
  manual: manualCenter.value,
}))

// Open Debug Panel and ensure fresh metrics
const openDebugPanel = async () => {
  if (startPoints.value.length >= 2) {
    try {
      debugData.value = await computeFullDebugMetrics(
        startPoints.value,
        allCenters.value,
        routingProvider
      )
    } catch (err) {
      console.warn('Error computing debug metrics:', err)
    }
  }
  showDebugPanel.value = true
}

// Toggle visibility of specific center and its radius on map
const toggleCenter = (mode: OptimizationMode) => {
  if (!visibleCenters.value[mode]) {
    visibleCenters.value[mode] = true
    activeMode.value = mode
  } else {
    visibleCenters.value[mode] = false
  }
}

let calculationSeq = 0

// Clear all Start-Points
const clearAllStartPoints = () => {
  calculationSeq++
  startPoints.value = []
  airCenter.value = null
  roadCenter.value = null
  timeCenter.value = null
  manualCenter.value = null
  isSettingManualCenter.value = false
  targetPoints.value = []
  selectedTargetId.value = null
  debugData.value = null
  isCalculatingCenters.value = { air: false, road: false, time: false }
}

// Clear all Target-Points
const clearAllTargetPoints = () => {
  targetPoints.value = []
  selectedTargetId.value = null
}

// Recompute centers whenever start points change
watch(
  startPoints,
  async (newPoints) => {
    const currentSeq = ++calculationSeq

    if (newPoints.length < 2) {
      airCenter.value = null
      roadCenter.value = null
      timeCenter.value = null
      debugData.value = null
      isCalculatingCenters.value = { air: false, road: false, time: false }
      return
    }

    // 1. Air Distance Center (Instant Weiszfeld)
    isCalculatingCenters.value.air = true
    airCenter.value = computeAirDistanceCenter(newPoints)
    isCalculatingCenters.value.air = false

    // 2. Road Distance and Driving Time Centers (Grid search with OSRM)
    isCalculatingCenters.value.road = true
    isCalculatingCenters.value.time = true
    try {
      const { roadCenter: rc, timeCenter: tc } = await computeRoadAndDrivingCenters(
        newPoints,
        routingProvider
      )
      if (currentSeq !== calculationSeq) return
      roadCenter.value = rc
      timeCenter.value = tc
    } catch (err) {
      if (currentSeq !== calculationSeq) return
      console.warn('Failed computing road/time centers, falling back to air center:', err)
      roadCenter.value = { ...airCenter.value, mode: 'road', label: 'Road Center (Air approx)' }
      timeCenter.value = { ...airCenter.value, mode: 'time', label: 'Driving Time Center (Air approx)' }
    } finally {
      if (currentSeq === calculationSeq) {
        isCalculatingCenters.value.road = false
        isCalculatingCenters.value.time = false
      }
    }

    // 3. Compute detailed diagnostics and attendee travel metrics matrix
    try {
      const metrics = await computeFullDebugMetrics(
        newPoints,
        allCenters.value,
        routingProvider
      )
      if (currentSeq !== calculationSeq) return
      debugData.value = metrics
    } catch (debugErr) {
      console.warn('Failed calculating debug metrics:', debugErr)
    }
  },
  { deep: true }
)

// Set manual center by coordinates & optional name
const setManualCenter = async (coords: { lat: number; lon: number }, name?: string) => {
  let label = name
  if (!label) {
    try {
      label = await geocodingProvider.reverse(coords.lat, coords.lon)
    } catch {
      label = 'Manual Center Point'
    }
  }
  manualCenter.value = {
    lat: coords.lat,
    lon: coords.lon,
    mode: 'manual',
    label: label || 'Manual Center Point',
  }
  activeMode.value = 'manual'
  visibleCenters.value.manual = true
  isSettingManualCenter.value = false

  if (debugData.value && startPoints.value.length >= 2) {
    computeFullDebugMetrics(startPoints.value, allCenters.value, routingProvider)
      .then((data) => { debugData.value = data })
      .catch(() => {})
  }
}

// Reset manual center to the group center (air center or centroid)
const resetManualCenterToGroupCenter = () => {
  if (airCenter.value) {
    setManualCenter({ lat: airCenter.value.lat, lon: airCenter.value.lon }, 'Group Air Center')
  } else if (startPoints.value.length > 0) {
    const cLat = startPoints.value.reduce((acc, p) => acc + p.lat, 0) / startPoints.value.length
    const cLon = startPoints.value.reduce((acc, p) => acc + p.lon, 0) / startPoints.value.length
    setManualCenter({ lat: cLat, lon: cLon }, 'Group Centroid')
  }
}

// Toggle interactive map placement
const toggleMapPlacement = () => {
  isSettingManualCenter.value = !isSettingManualCenter.value
  if (isSettingManualCenter.value) {
    activeMode.value = 'manual'
    visibleCenters.value.manual = true
  }
}

// Auto-initialize manual center if switched to manual and none is set
watch(activeMode, (newMode) => {
  if (newMode === 'manual' && !manualCenter.value) {
    resetManualCenterToGroupCenter()
  }
})

// Add a Start-Point
const addStartPoint = (pointData: Omit<StartPoint, 'id' | 'color'>) => {
  const nextColor = START_POINT_COLORS[startPoints.value.length % START_POINT_COLORS.length]
  const newPt: StartPoint = {
    id: `pt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: pointData.name,
    lat: pointData.lat,
    lon: pointData.lon,
    color: nextColor,
  }
  startPoints.value.push(newPt)
}

// Remove a Start-Point
const removeStartPoint = (id: string) => {
  startPoints.value = startPoints.value.filter((p) => p.id !== id)
  if (startPoints.value.length < 2) {
    targetPoints.value = []
  }
}

// Handle Map Click to add Start-Point or set Manual Center
const handleMapClick = async (coords: { lat: number; lon: number }) => {
  if (isSettingManualCenter.value) {
    await setManualCenter(coords)
    return
  }
  const addressName = await geocodingProvider.reverse(coords.lat, coords.lon)
  addStartPoint({
    name: addressName,
    lat: coords.lat,
    lon: coords.lon,
  })
}

// Center map on specific Start-Point
const centerOnPoint = (point: StartPoint) => {
  mapViewRef.value?.panTo(point.lat, point.lon, 14)
}

// Select a Target Point
const selectTarget = (target: TargetPoint) => {
  selectedTargetId.value = target.id
  activeTab.value = 'results'
  mapViewRef.value?.panTo(target.lat, target.lon, 15)
}

// Search Target Points
const executeSearch = async () => {
  if (activeMode.value === 'manual' && !manualCenter.value) {
    resetManualCenterToGroupCenter()
  }
  if (!activeCenter.value) return
  if (startPoints.value.length < 2 && activeMode.value !== 'manual') return

  isSearching.value = true
  selectedTargetId.value = null

  try {
    const query = customQuery.value.trim() || selectedCategory.value
    const center = { lat: activeCenter.value.lat, lon: activeCenter.value.lon }
    const radiusMeters = radiusKm.value * 1000

    // 1. Fetch raw POIs around center
    const rawPOIs = await targetPointProvider.searchPOIs(center, radiusMeters, query)

    // 2. Multi-Mode Evaluation & Fairness scoring
    const evaluated = await evaluateTargetPoints(
      startPoints.value,
      rawPOIs,
      routingProvider,
      activeMode.value
    )

    targetPoints.value = evaluated
    activeTab.value = 'results'
  } catch (err) {
    console.error('Target search failed:', err)
  } finally {
    isSearching.value = false
  }
}

// Load Sample Group (Berlin) for immediate hands-on verification
const loadSampleGroup = () => {
  startPoints.value = [
    {
      id: 'sample-1',
      name: 'Alexanderplatz, Berlin Mitte',
      lat: 52.5219,
      lon: 13.4132,
      color: START_POINT_COLORS[0],
    },
    {
      id: 'sample-2',
      name: 'Charlottenburg Palace, Berlin',
      lat: 52.5206,
      lon: 13.2956,
      color: START_POINT_COLORS[1],
    },
    {
      id: 'sample-3',
      name: 'Tempelhofer Feld / Neukölln',
      lat: 52.4735,
      lon: 13.4022,
      color: START_POINT_COLORS[2],
    },
  ]
}

onMounted(() => {
  // Automatically load the sample group on first run so user sees immediate interactivity
  loadSampleGroup()
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
    <!-- Top Header -->
    <header class="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0 z-30 shadow-md">
      <div class="flex items-center gap-3">
        <!-- Brand TriShield Logo -->
        <div class="flex items-center gap-2">
          <TriShieldIcon :air="true" :road="true" :time="true" :size="32" />
          <div>
            <h1 class="text-base font-black tracking-tight bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 bg-clip-text text-transparent">
              EquiMeet
            </h1>
            <p class="text-[10px] text-slate-400 -mt-1 hidden sm:block">Multi-Mode Equidistant Meetup Finder</p>
          </div>
        </div>
      </div>

      <!-- Interactive Clickable Mode Legend & Calculation Spinners -->
      <div class="hidden sm:flex items-center gap-2 text-xs">
        <!-- Air Distance Toggle -->
        <button
          type="button"
          @click="toggleCenter('air')"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium cursor-pointer shadow-sm select-none"
          :class="[
            visibleCenters.air
              ? (activeMode === 'air' ? 'bg-sky-950/90 border-sky-400 text-sky-100 ring-1 ring-sky-400/50' : 'bg-sky-950/60 border-sky-500/60 text-sky-200')
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400 opacity-60'
          ]"
          title="Click to toggle Air Distance center & radius circle on map"
        >
          <Loader2 v-if="isCalculatingCenters.air || (startPoints.length >= 2 && !airCenter)" class="w-3.5 h-3.5 text-sky-400 animate-spin" />
          <span v-else class="w-2.5 h-2.5 rounded-full" :class="visibleCenters.air ? 'bg-sky-400 ring-2 ring-sky-400/30' : 'bg-slate-600'"></span>
          <span :class="{ 'line-through opacity-70': !visibleCenters.air }">Air Distance</span>
          <span v-if="isCalculatingCenters.air || (startPoints.length >= 2 && !airCenter)" class="text-[10px] text-sky-400 font-normal animate-pulse">(calculating...)</span>
          <span v-else-if="activeMode === 'air'" class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-500/30 text-sky-300">Active</span>
        </button>

        <!-- Road Distance Toggle -->
        <button
          type="button"
          @click="toggleCenter('road')"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium cursor-pointer shadow-sm select-none"
          :class="[
            visibleCenters.road
              ? (activeMode === 'road' ? 'bg-emerald-950/90 border-emerald-400 text-emerald-100 ring-1 ring-emerald-400/50' : 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200')
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400 opacity-60'
          ]"
          title="Click to toggle Road Distance center & radius circle on map"
        >
          <Loader2 v-if="isCalculatingCenters.road || (startPoints.length >= 2 && !roadCenter)" class="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          <span v-else class="w-2.5 h-2.5 rounded-full" :class="visibleCenters.road ? 'bg-emerald-400 ring-2 ring-emerald-400/30' : 'bg-slate-600'"></span>
          <span :class="{ 'line-through opacity-70': !visibleCenters.road }">Road Distance</span>
          <span v-if="isCalculatingCenters.road || (startPoints.length >= 2 && !roadCenter)" class="text-[10px] text-emerald-400 font-normal animate-pulse">(calculating...)</span>
          <span v-else-if="activeMode === 'road'" class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300">Active</span>
        </button>

        <!-- Driving Time Toggle -->
        <button
          type="button"
          @click="toggleCenter('time')"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium cursor-pointer shadow-sm select-none"
          :class="[
            visibleCenters.time
              ? (activeMode === 'time' ? 'bg-amber-950/90 border-amber-400 text-amber-100 ring-1 ring-amber-400/50' : 'bg-amber-950/60 border-amber-500/60 text-amber-200')
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400 opacity-60'
          ]"
          title="Click to toggle Driving Time center & radius circle on map"
        >
          <Loader2 v-if="isCalculatingCenters.time || (startPoints.length >= 2 && !timeCenter)" class="w-3.5 h-3.5 text-amber-400 animate-spin" />
          <span v-else class="w-2.5 h-2.5 rounded-full" :class="visibleCenters.time ? 'bg-amber-400 ring-2 ring-amber-400/30' : 'bg-slate-600'"></span>
          <span :class="{ 'line-through opacity-70': !visibleCenters.time }">Driving Time</span>
          <span v-if="isCalculatingCenters.time || (startPoints.length >= 2 && !timeCenter)" class="text-[10px] text-amber-400 font-normal animate-pulse">(calculating...)</span>
          <span v-else-if="activeMode === 'time'" class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300">Active</span>
        </button>

        <!-- Manual Center Toggle -->
        <button
          type="button"
          @click="toggleCenter('manual')"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium cursor-pointer shadow-sm select-none"
          :class="[
            visibleCenters.manual
              ? (activeMode === 'manual' ? 'bg-violet-950/90 border-violet-400 text-violet-100 ring-1 ring-violet-400/50' : 'bg-violet-950/60 border-violet-500/60 text-violet-200')
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400 opacity-60'
          ]"
          title="Click to toggle Manual Center & radius circle on map"
        >
          <span class="w-2.5 h-2.5 rounded-sm rotate-45" :class="visibleCenters.manual ? 'bg-violet-400 ring-2 ring-violet-400/30' : 'bg-slate-600'"></span>
          <span :class="{ 'line-through opacity-70': !visibleCenters.manual }">Manual Center</span>
          <span v-if="activeMode === 'manual'" class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-violet-500/30 text-violet-300">Active</span>
        </button>
      </div>

      <!-- Header Actions: Debug Button & Attendees Pill -->
      <div class="flex items-center gap-2.5">
        <button
          type="button"
          @click="openDebugPanel"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:border-slate-600 text-slate-200 transition-all text-xs font-medium cursor-pointer shadow-sm select-none"
          title="Open Calculation Metrics & Diagnostics Panel"
        >
          <Activity class="w-3.5 h-3.5 text-cyan-400" />
          <span>Metrics & Debug</span>
        </button>

        <div class="hidden sm:flex px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 items-center gap-1.5">
          <span class="w-2 h-2 rounded-full" :class="startPoints.length >= 2 ? 'bg-emerald-400' : 'bg-amber-400'"></span>
          <span>{{ startPoints.length }} Attendees</span>
        </div>
      </div>
    </header>

    <!-- Main Workspace Area -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- Left Sidebar Panel -->
      <aside class="w-full sm:w-[420px] md:w-[450px] bg-slate-900/95 backdrop-blur-md border-r border-slate-800 flex flex-col z-20 shadow-2xl flex-shrink-0">
        <!-- Sidebar Navigation Tabs -->
        <div class="flex border-b border-slate-800 bg-slate-900/80 px-2 pt-2">
          <button
            @click="activeTab = 'setup'"
            class="flex-1 py-2.5 px-3 text-xs font-semibold rounded-t-xl transition-all flex items-center justify-center gap-2"
            :class="[
              activeTab === 'setup'
                ? 'bg-slate-800 text-sky-400 border-t-2 border-sky-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            ]"
          >
            <Sliders class="w-3.5 h-3.5" />
            <span>Setup & Controls</span>
          </button>

          <button
            @click="activeTab = 'results'"
            class="flex-1 py-2.5 px-3 text-xs font-semibold rounded-t-xl transition-all flex items-center justify-center gap-2 relative"
            :class="[
              activeTab === 'results'
                ? 'bg-slate-800 text-sky-400 border-t-2 border-sky-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            ]"
          >
            <ListFilter class="w-3.5 h-3.5" />
            <span>Target Places</span>
            <span
              v-if="targetPoints.length > 0"
              class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30"
            >
              {{ targetPoints.length }}
            </span>
          </button>
        </div>

        <!-- Tab 1: Setup & Controls -->
        <div v-show="activeTab === 'setup'" class="flex-1 overflow-y-auto p-4 space-y-6">
          <!-- Start Points Panel -->
          <StartPointsPanel
            :start-points="startPoints"
            :geocoding-provider="geocodingProvider"
            @add-point="addStartPoint"
            @remove-point="removeStartPoint"
            @center-point="centerOnPoint"
            @load-sample="loadSampleGroup"
            @clear-all="clearAllStartPoints"
          />

          <div class="h-px bg-slate-800"></div>

          <!-- Search Controls (Mode, Radius 1-20km, Categories) -->
          <SearchControls
            :mode="activeMode"
            :radius-km="radiusKm"
            :selected-category="selectedCategory"
            :custom-query="customQuery"
            :can-search="(startPoints.length >= 2) || (activeMode === 'manual' && !!manualCenter)"
            :is-searching="isSearching"
            :has-target-points="targetPoints.length > 0"
            :target-count="targetPoints.length"
            :manual-center="manualCenter"
            :is-setting-manual-center="isSettingManualCenter"
            :geocoding-provider="geocodingProvider"
            @update:mode="activeMode = $event; visibleCenters[$event] = true;"
            @update:radius-km="radiusKm = $event"
            @update:selected-category="selectedCategory = $event"
            @update:custom-query="customQuery = $event"
            @search="executeSearch"
            @clear-targets="clearAllTargetPoints"
            @set-manual-center="setManualCenter"
            @reset-manual-center="resetManualCenterToGroupCenter"
            @toggle-map-placement="toggleMapPlacement"
          />
        </div>

        <!-- Tab 2: Target Points List View -->
        <div v-show="activeTab === 'results'" class="flex-1 overflow-hidden p-4">
          <TargetPointsList
            :target-points="targetPoints"
            :start-points="startPoints"
            :selected-target-id="selectedTargetId"
            :active-mode="activeMode"
            @select-target="selectTarget"
            @clear-targets="clearAllTargetPoints"
          />
        </div>
      </aside>

      <!-- Right Map View Canvas -->
      <main class="flex-1 h-full relative z-10">
        <MapView
          ref="mapViewRef"
          :start-points="startPoints"
          :active-center="activeCenter"
          :all-centers="allCenters"
          :visible-centers="visibleCenters"
          :radius-km="radiusKm"
          :active-mode="activeMode"
          :target-points="targetPoints"
          :selected-target-id="selectedTargetId"
          :is-setting-manual-center="isSettingManualCenter"
          @map-click="handleMapClick"
          @select-target="selectTarget"
          @select-mode="activeMode = $event; visibleCenters[$event] = true;"
          @set-manual-center="setManualCenter"
          @cancel-set-manual-center="isSettingManualCenter = false"
        />
      </main>
    </div>

    <!-- Debug & Metrics Slide-Over Panel Modal -->
    <DebugPanel
      :show="showDebugPanel"
      :debug-data="debugData"
      :active-mode="activeMode"
      @close="showDebugPanel = false"
    />
  </div>
</template>
