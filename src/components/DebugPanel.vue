<script setup lang="ts">
import { ref, computed } from 'vue'
import { FullDebugData, OptimizationMode, MODE_COLORS } from '../types'
import {
  X,
  Gauge,
  Activity,
  Compass,
  Car,
  Clock,
  Info,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  TrendingDown,
  Layers,
  Target,
} from 'lucide-vue-next'

const props = defineProps<{
  show: boolean
  debugData: FullDebugData | null
  activeMode: OptimizationMode
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeTab = ref<'matrix' | 'comparison' | 'algorithm'>('matrix')

const formatDist = (meters: number): string => {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

const formatDuration = (seconds: number): string => {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
}

const engineBadge = computed(() => {
  const source = props.debugData?.centers.road?.engineSource || props.debugData?.centers.time?.engineSource
  if (source === 'osrm') {
    return {
      text: 'OSRM Live Road Server',
      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: CheckCircle2,
    }
  }
  return {
    text: 'Geometric Road Network Model',
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    icon: AlertTriangle,
  }
})
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md transition-all animate-fadeIn"
    @click.self="emit('close')"
  >
    <div
      class="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100"
    >
      <!-- Top Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 flex-shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-xl bg-gradient-to-br from-sky-500/20 via-emerald-500/20 to-amber-500/20 border border-slate-700">
            <Activity class="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                Calculation Metrics & Algorithm Diagnostics
              </h2>
              <span
                class="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
                :class="engineBadge.color"
              >
                <component :is="engineBadge.icon" class="w-3 h-3" />
                <span>{{ engineBadge.text }}</span>
              </span>
            </div>
            <p class="text-xs text-slate-400">
              Multi-mode distance matrix, group fairness statistics, and routing engine evaluation
            </p>
          </div>
        </div>

        <button
          type="button"
          @click="emit('close')"
          class="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          title="Close Debug Panel"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex border-b border-slate-800 bg-slate-950/40 px-5 pt-2 flex-shrink-0">
        <button
          @click="activeTab = 'matrix'"
          class="py-2.5 px-4 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2"
          :class="[
            activeTab === 'matrix'
              ? 'border-sky-400 text-sky-400 bg-slate-800/80'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
          ]"
        >
          <Layers class="w-3.5 h-3.5" />
          <span>Attendee Travel Matrix</span>
        </button>

        <button
          @click="activeTab = 'comparison'"
          class="py-2.5 px-4 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2"
          :class="[
            activeTab === 'comparison'
              ? 'border-emerald-400 text-emerald-400 bg-slate-800/80'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
          ]"
        >
          <Gauge class="w-3.5 h-3.5" />
          <span>Center Comparison & Fairness</span>
        </button>

        <button
          @click="activeTab = 'algorithm'"
          class="py-2.5 px-4 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2"
          :class="[
            activeTab === 'algorithm'
              ? 'border-amber-400 text-amber-400 bg-slate-800/80'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
          ]"
        >
          <HelpCircle class="w-3.5 h-3.5" />
          <span>How Driving Time is Calculated</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="flex-1 overflow-y-auto p-5 space-y-6">
        <!-- TAB 1: Attendee Travel Matrix -->
        <div v-if="activeTab === 'matrix'" class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-xs text-slate-400">
              Matrix of individual travel metrics from each start-point to the three calculated center points.
            </p>
            <div class="text-[11px] text-slate-500 font-mono">
              Attendees: {{ debugData?.startPoints.length ?? 0 }}
            </div>
          </div>

          <div v-if="!debugData || debugData.startPoints.length === 0" class="p-8 text-center text-slate-500 text-xs">
            No start-points entered yet. Add at least 2 start-points on the map or search panel.
          </div>

          <div v-else class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                  <th class="py-3 px-4">Start Point</th>
                  <th class="py-3 px-3 text-center bg-sky-950/30 text-sky-300 border-l border-r border-slate-800/80">
                    <div class="flex items-center justify-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-sky-400"></span>
                      <span>Air Distance Center</span>
                    </div>
                  </th>
                  <th class="py-3 px-3 text-center bg-emerald-950/30 text-emerald-300 border-r border-slate-800/80">
                    <div class="flex items-center justify-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span>Road Distance Center</span>
                    </div>
                  </th>
                  <th class="py-3 px-3 text-center bg-amber-950/30 text-amber-300 border-r border-slate-800/80">
                    <div class="flex items-center justify-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                      <span>Driving Time Center</span>
                    </div>
                  </th>
                  <th v-if="debugData.centers.manual" class="py-3 px-3 text-center bg-violet-950/30 text-violet-300">
                    <div class="flex items-center justify-center gap-1.5">
                      <span class="w-2 h-2 rounded-sm rotate-45 bg-violet-400"></span>
                      <span>Manual Center</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                <tr
                  v-for="row in debugData.matrix"
                  :key="row.startPointId"
                  class="hover:bg-slate-800/40 transition-colors"
                >
                  <!-- Start Point Column -->
                  <td class="py-3 px-4 font-medium flex items-center gap-2">
                    <span
                      class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      :style="{ backgroundColor: row.color }"
                    ></span>
                    <span class="truncate max-w-[180px] sm:max-w-[220px]" :title="row.startPointName">
                      {{ row.startPointName }}
                    </span>
                  </td>

                  <!-- Air Center Metrics -->
                  <td class="py-2 px-3 text-center bg-sky-950/10 border-l border-r border-slate-800/60 font-mono text-[11px]">
                    <div v-if="row.airCenter" class="space-y-0.5">
                      <div class="text-sky-300 font-semibold flex items-center justify-center gap-1">
                        <Compass class="w-3 h-3 text-sky-400" />
                        <span>{{ formatDist(row.airCenter.airMeters) }}</span>
                      </div>
                      <div class="text-slate-400 text-[10px] flex items-center justify-center gap-2">
                        <span>Road: {{ formatDist(row.airCenter.roadMeters) }}</span>
                        <span>•</span>
                        <span>Time: {{ formatDuration(row.airCenter.timeSeconds) }}</span>
                      </div>
                    </div>
                    <span v-else class="text-slate-600">-</span>
                  </td>

                  <!-- Road Center Metrics -->
                  <td class="py-2 px-3 text-center bg-emerald-950/10 border-r border-slate-800/60 font-mono text-[11px]">
                    <div v-if="row.roadCenter" class="space-y-0.5">
                      <div class="text-emerald-300 font-semibold flex items-center justify-center gap-1">
                        <Car class="w-3 h-3 text-emerald-400" />
                        <span>{{ formatDist(row.roadCenter.roadMeters) }}</span>
                      </div>
                      <div class="text-slate-400 text-[10px] flex items-center justify-center gap-2">
                        <span>Air: {{ formatDist(row.roadCenter.airMeters) }}</span>
                        <span>•</span>
                        <span>Time: {{ formatDuration(row.roadCenter.timeSeconds) }}</span>
                      </div>
                    </div>
                    <span v-else class="text-slate-600">-</span>
                  </td>

                  <!-- Driving Time Center Metrics -->
                  <td class="py-2 px-3 text-center bg-amber-950/10 border-r border-slate-800/60 font-mono text-[11px]">
                    <div v-if="row.timeCenter" class="space-y-0.5">
                      <div class="text-amber-300 font-semibold flex items-center justify-center gap-1">
                        <Clock class="w-3 h-3 text-amber-400" />
                        <span>{{ formatDuration(row.timeCenter.timeSeconds) }}</span>
                      </div>
                      <div class="text-slate-400 text-[10px] flex items-center justify-center gap-2">
                        <span>Road: {{ formatDist(row.timeCenter.roadMeters) }}</span>
                        <span>•</span>
                        <span>Air: {{ formatDist(row.timeCenter.airMeters) }}</span>
                      </div>
                    </div>
                    <span v-else class="text-slate-600">-</span>
                  </td>

                  <!-- Manual Center Metrics -->
                  <td v-if="debugData.centers.manual" class="py-2 px-3 text-center bg-violet-950/10 font-mono text-[11px]">
                    <div v-if="row.manualCenter" class="space-y-0.5">
                      <div class="text-violet-300 font-semibold flex items-center justify-center gap-1">
                        <Target class="w-3 h-3 text-violet-400" />
                        <span>{{ formatDist(row.manualCenter.airMeters) }}</span>
                      </div>
                      <div class="text-slate-400 text-[10px] flex items-center justify-center gap-2">
                        <span>Road: {{ formatDist(row.manualCenter.roadMeters) }}</span>
                        <span>•</span>
                        <span>Time: {{ formatDuration(row.manualCenter.timeSeconds) }}</span>
                      </div>
                    </div>
                    <span v-else class="text-slate-600">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- TAB 2: Center Comparison & Fairness -->
        <div v-if="activeTab === 'comparison'" class="space-y-5">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <!-- Air Center Card -->
            <div
              v-if="debugData?.centers.air"
              class="p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 flex flex-col justify-between space-y-4"
            >
              <div>
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-sky-400"></span>
                    <h3 class="text-sm font-bold text-sky-200">Air Distance Center</h3>
                  </div>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">Weiszfeld</span>
                </div>
                <p class="text-[11px] text-slate-400">
                  Fermat-Weber geometric median minimizing straight-line air distance.
                </p>
                <div class="mt-3 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] font-mono text-slate-300">
                  <div>Lat: {{ debugData.centers.air.center.lat.toFixed(5) }}</div>
                  <div>Lon: {{ debugData.centers.air.center.lon.toFixed(5) }}</div>
                </div>
              </div>

              <div class="space-y-2 text-xs border-t border-sky-500/20 pt-3 font-mono">
                <div class="flex justify-between">
                  <span class="text-slate-400">Mean Air Trip:</span>
                  <span class="text-sky-300 font-bold">{{ formatDist(debugData.centers.air.stats.airDistance.mean) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Mean Road Dist:</span>
                  <span class="text-slate-200">{{ formatDist(debugData.centers.air.stats.roadDistance.mean) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Mean Drive Time:</span>
                  <span class="text-slate-200">{{ formatDuration(debugData.centers.air.stats.drivingTime.mean) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Std Dev Spread (σ):</span>
                  <span class="text-slate-300">{{ formatDist(debugData.centers.air.stats.airDistance.stdDev) }}</span>
                </div>
              </div>
            </div>

            <!-- Road Center Card -->
            <div
              v-if="debugData?.centers.road"
              class="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex flex-col justify-between space-y-4"
            >
              <div>
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-emerald-400"></span>
                    <h3 class="text-sm font-bold text-emerald-200">Road Distance Center</h3>
                  </div>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">Shortest Path</span>
                </div>
                <p class="text-[11px] text-slate-400">
                  Optimal meetup point minimizing actual physical road kilometers driven.
                </p>
                <div class="mt-3 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] font-mono text-slate-300">
                  <div>Lat: {{ debugData.centers.road.center.lat.toFixed(5) }}</div>
                  <div>Lon: {{ debugData.centers.road.center.lon.toFixed(5) }}</div>
                </div>
              </div>

              <div class="space-y-2 text-xs border-t border-emerald-500/20 pt-3 font-mono">
                <div class="flex justify-between">
                  <span class="text-slate-400">Mean Road Dist (μ):</span>
                  <span class="text-emerald-300 font-bold">{{ formatDist(debugData.centers.road.stats.roadDistance.mean) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Group Spread (σ):</span>
                  <span class="text-emerald-300">{{ formatDist(debugData.centers.road.stats.roadDistance.stdDev) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Trip Disparity (Δ):</span>
                  <span class="text-slate-300">
                    {{ formatDist(debugData.centers.road.stats.roadDistance.max - debugData.centers.road.stats.roadDistance.min) }}
                  </span>
                </div>
                <div class="flex justify-between font-semibold pt-1 border-t border-emerald-500/20">
                  <span class="text-slate-400">Score (μ + 1.25σ):</span>
                  <span class="text-emerald-400">{{ (debugData.centers.road.stats.roadDistance.score / 1000).toFixed(1) }} km</span>
                </div>
              </div>
            </div>

            <!-- Driving Time Center Card -->
            <div
              v-if="debugData?.centers.time"
              class="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 flex flex-col justify-between space-y-4"
            >
              <div>
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-amber-400"></span>
                    <h3 class="text-sm font-bold text-amber-200">Driving Time Center</h3>
                  </div>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">Fastest Arrival</span>
                </div>
                <p class="text-[11px] text-slate-400">
                  Minimizes total travel minutes, favoring high-speed highway corridors.
                </p>
                <div class="mt-3 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] font-mono text-slate-300">
                  <div>Lat: {{ debugData.centers.time.center.lat.toFixed(5) }}</div>
                  <div>Lon: {{ debugData.centers.time.center.lon.toFixed(5) }}</div>
                </div>
              </div>

              <div class="space-y-2 text-xs border-t border-amber-500/20 pt-3 font-mono">
                <div class="flex justify-between">
                  <span class="text-slate-400">Mean Drive Time (μ):</span>
                  <span class="text-amber-300 font-bold">{{ formatDuration(debugData.centers.time.stats.drivingTime.mean) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Group Spread (σ):</span>
                  <span class="text-amber-300">{{ formatDuration(debugData.centers.time.stats.drivingTime.stdDev) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Trip Disparity (Δ):</span>
                  <span class="text-slate-300">
                    {{ formatDuration(debugData.centers.time.stats.drivingTime.max - debugData.centers.time.stats.drivingTime.min) }}
                  </span>
                </div>
                <div class="flex justify-between font-semibold pt-1 border-t border-amber-500/20">
                  <span class="text-slate-400">Score (μ + 1.25σ):</span>
                  <span class="text-amber-400">{{ formatDuration(debugData.centers.time.stats.drivingTime.score) }}</span>
                </div>
              </div>
            </div>

            <!-- Manual Center Card -->
            <div
              v-if="debugData?.centers.manual"
              class="p-4 rounded-xl border border-violet-500/40 bg-violet-950/20 flex flex-col justify-between space-y-4"
            >
              <div>
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-sm rotate-45 bg-violet-400"></span>
                    <h3 class="text-sm font-bold text-violet-200">Manual Center Point</h3>
                  </div>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 font-mono">User Defined</span>
                </div>
                <p class="text-[11px] text-slate-400">
                  Custom center specified directly on the map for targeted searches.
                </p>
                <div class="mt-3 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] font-mono text-slate-300">
                  <div>Lat: {{ debugData.centers.manual.center.lat.toFixed(5) }}</div>
                  <div>Lon: {{ debugData.centers.manual.center.lon.toFixed(5) }}</div>
                </div>
              </div>

              <div class="space-y-2 text-xs border-t border-violet-500/20 pt-3 font-mono">
                <div class="flex justify-between">
                  <span class="text-slate-400">Mean Road Dist:</span>
                  <span class="text-violet-300 font-bold">{{ formatDist(debugData.centers.manual.stats.roadDistance.mean) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Mean Drive Time:</span>
                  <span class="text-violet-300">{{ formatDuration(debugData.centers.manual.stats.drivingTime.mean) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Group Spread (σ):</span>
                  <span class="text-slate-300">{{ formatDist(debugData.centers.manual.stats.roadDistance.stdDev) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Disparity (Δ):</span>
                  <span class="text-slate-300">
                    {{ formatDist(debugData.centers.manual.stats.roadDistance.max - debugData.centers.manual.stats.roadDistance.min) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: How Driving Time is Calculated -->
        <div v-if="activeTab === 'algorithm'" class="space-y-5 text-xs text-slate-300 leading-relaxed">
          <div class="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-3">
            <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Car class="w-4 h-4 text-amber-400" />
              <span>1. How Driving Time is Calculated</span>
            </h3>
            <p>
              Driving time is evaluated using the <strong>Open Source Routing Machine (OSRM)</strong> road network graph derived from OpenStreetMap data. Unlike air distance (straight-line bird flight) or road distance (physical segment length), driving time computes the fastest path based on realistic road attributes:
            </p>
            <ul class="list-disc list-inside space-y-1.5 pl-2 text-slate-400">
              <li>
                <strong class="text-slate-200">Road Hierarchy & Speeds:</strong> Motorways (Autobahn) have edge speeds of 100–130 km/h; primary Bundesstraßen have edge speeds of 70–100 km/h; regional secondary roads are 50–70 km/h; urban residential streets are 30–50 km/h.
              </li>
              <li>
                <strong class="text-slate-200">Intersection & Turn Penalties:</strong> Left turns, traffic signals, roundabouts, and urban street density apply dynamic duration penalties in OSRM's routing engine.
              </li>
              <li>
                <strong class="text-slate-200">Highways vs Direct Cuts:</strong> Driving time prioritizes high-speed Autobahn corridors (e.g. A3, A45, A4) even if the detour adds 15–30 km to physical distance, because driving at 120 km/h takes half the time of driving through town centers at 50 km/h.
              </li>
            </ul>
          </div>

          <div class="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-3">
            <h3 class="text-sm font-bold text-slate-100 flex items-center gap-2">
              <TrendingDown class="w-4 h-4 text-emerald-400" />
              <span>2. Road Distance vs Driving Time Objectives</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div class="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 space-y-1">
                <span class="font-bold text-emerald-300">Minimal Road Distance</span>
                <p class="text-slate-400">
                  Minimizes the total physical kilometers travelled:
                  <code class="text-emerald-400">Score = Mean(km) + 1.25 × StdDev(km)</code>.
                  Favors direct national/state roads (Bundesstraßen) that minimize odometer distance.
                </p>
              </div>
              <div class="p-3 rounded-lg bg-amber-950/20 border border-amber-500/20 space-y-1">
                <span class="font-bold text-amber-300">Minimal Driving Time</span>
                <p class="text-slate-400">
                  Minimizes the total transit duration in minutes:
                  <code class="text-amber-400">Score = Mean(seconds) + 1.25 × StdDev(seconds)</code>.
                  Pulls the meetup center towards major motorway junctions (e.g. Kreuz Olpe, Wetzlar A45) where all participants can stay on high-speed motorways.
                </p>
              </div>
            </div>
          </div>

          <div class="p-4 rounded-xl border border-sky-800/40 bg-sky-950/20 space-y-3">
            <h3 class="text-sm font-bold text-sky-200 flex items-center gap-2">
              <Info class="w-4 h-4 text-sky-400" />
              <span>3. Case Analysis: Mannheim, Bielefeld, and Düsseldorf</span>
            </h3>
            <p class="text-slate-300">
              When entering Mannheim, Bielefeld, and Düsseldorf:
            </p>
            <ol class="list-decimal list-inside space-y-1.5 pl-2 text-slate-400">
              <li>
                <strong class="text-slate-200">Natural Geometric Equidistance:</strong> Mannheim to Bielefeld is ~282 km, Mannheim to Düsseldorf is ~227 km, and Bielefeld to Düsseldorf is ~150 km. The midpoint between Mannheim and Bielefeld (near Dillenburg / Haiger on the Hessen/NRW border) is ~141 km from Mannheim, ~141 km from Bielefeld, and ~131 km from Düsseldorf. This geographic point happens to be naturally balanced for all three attendees!
              </li>
              <li>
                <strong class="text-slate-200">The Coarse Grid Root Cause:</strong> Previously, candidate search used a coarse 13-point bounding box grid (~70 km spacing). Because candidate #2 (Dillenburg) had balanced ~140 km trips while the other 12 points had extreme disparities (e.g. 50 km vs 250 km), candidate #2 was picked by both algorithms because no other candidate was nearby.
              </li>
              <li>
                <strong class="text-slate-200">High-Density Multi-Geometry & Two-Pass Refinement:</strong> The algorithm now evaluates 40+ high-resolution candidate locations (Air center, centroid, pairwise midpoints, trisections, concentric radial rings) followed by a fine-grained local refinement zoom around the best candidates.
              </li>
            </ol>
          </div>
        </div>
      </div>

      <!-- Bottom Footer -->
      <div class="px-5 py-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
        <span v-if="debugData">
          Updated at {{ debugData.lastUpdated.toLocaleTimeString() }}
        </span>
        <span v-else>No metrics computed</span>

        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
        >
          Close Diagnostics
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.animate-fadeIn {
  animation: fadeIn 0.15s ease-out;
}
</style>
