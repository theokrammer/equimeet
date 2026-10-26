<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { TargetPoint, StartPoint, OptimizationMode, MODE_COLORS } from '../types'
import TriShieldIcon from './TriShieldIcon.vue'
import {
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  Globe,
  Phone,
  CheckCircle2,
  Filter,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'

const props = defineProps<{
  targetPoints: TargetPoint[]
  startPoints: StartPoint[]
  selectedTargetId: string | null
  activeMode: OptimizationMode
}>()

const emit = defineEmits<{
  (e: 'select-target', target: TargetPoint): void
  (e: 'clear-targets'): void
}>()

const filterMode = ref<'all' | 'multi' | 'air' | 'road' | 'time'>('all')
const expandedTargetIds = ref<Set<string>>(new Set())
const itemRefs = ref<Record<string, HTMLElement>>({})

const toggleExpand = (id: string, e: Event) => {
  e.stopPropagation()
  if (expandedTargetIds.value.has(id)) {
    expandedTargetIds.value.delete(id)
  } else {
    expandedTargetIds.value.add(id)
  }
}

const filteredPoints = computed(() => {
  if (filterMode.value === 'all') return props.targetPoints
  if (filterMode.value === 'multi') {
    return props.targetPoints.filter((t) => {
      let count = 0
      if (t.metrics.air.qualifies) count++
      if (t.metrics.road.qualifies) count++
      if (t.metrics.time.qualifies) count++
      return count >= 2
    })
  }
  const modeKey = filterMode.value as 'air' | 'road' | 'time'
  return props.targetPoints.filter((t) => t.metrics[modeKey].qualifies)
})

const scrollToSelected = (id: string | null) => {
  if (!id) return
  if (!filteredPoints.value.some((t) => t.id === id)) {
    filterMode.value = 'all'
  }
  nextTick(() => {
    const el = itemRefs.value[id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })
}

watch(
  () => props.selectedTargetId,
  (newId) => {
    scrollToSelected(newId)
  }
)

const formatDistance = (meters: number) => {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

const formatDuration = (seconds: number) => {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs}h ${remMins}m`
}
</script>

<template>
  <div class="flex flex-col h-full space-y-3">
    <!-- Header & Filter Chips -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Target Places ({{ filteredPoints.length }})
          </h3>
          <span class="text-xs text-slate-400">
            Ranked by multi-mode fairness
          </span>
        </div>
        <button
          v-if="targetPoints.length > 0"
          @click="emit('clear-targets')"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-700 hover:border-rose-500/50 transition-colors shadow-sm"
          title="Clear all target places"
        >
          <Trash2 class="w-3.5 h-3.5" />
          Clear Results
        </button>
      </div>

      <!-- Quick Filter Pills -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          @click="filterMode = 'all'"
          class="px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap"
          :class="filterMode === 'all' ? 'bg-slate-700 border-slate-500 text-white font-medium' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'"
        >
          All ({{ targetPoints.length }})
        </button>

        <button
          @click="filterMode = 'multi'"
          class="px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1"
          :class="filterMode === 'multi' ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300 font-medium' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'"
        >
          <Sparkles class="w-3 h-3 text-indigo-400" />
          Multi-Qualified
        </button>

        <button
          @click="filterMode = 'air'"
          class="px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap"
          :class="filterMode === 'air' ? 'bg-sky-950/80 border-sky-500 text-sky-300 font-medium' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'"
        >
          Air
        </button>

        <button
          @click="filterMode = 'road'"
          class="px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap"
          :class="filterMode === 'road' ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-medium' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'"
        >
          Road
        </button>

        <button
          @click="filterMode = 'time'"
          class="px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap"
          :class="filterMode === 'time' ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-medium' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'"
        >
          Time
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="filteredPoints.length === 0"
      class="flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-slate-800/40 border border-slate-800 text-slate-400 space-y-2"
    >
      <MapPin class="w-8 h-8 text-slate-400" />
      <p class="text-sm font-medium text-slate-300">No target places found</p>
      <p class="text-xs text-slate-400">
        Try adjusting the search radius or category filter.
      </p>
    </div>

    <!-- Target Points List -->
    <div class="flex-1 overflow-y-auto space-y-2.5 pr-1">
      <div
        v-for="target in filteredPoints"
        :key="target.id"
        :ref="(el) => { if (el) itemRefs[target.id] = el as HTMLElement }"
        @click="emit('select-target', target)"
        class="p-3.5 rounded-xl border transition-all cursor-pointer group"
        :class="[
          selectedTargetId === target.id
            ? 'bg-slate-800/95 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/10'
            : 'bg-slate-800/60 border-slate-700/70 hover:border-slate-600 hover:bg-slate-800/80'
        ]"
      >
        <!-- Top Row: Name, Category, TriShield -->
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-700/80 text-slate-300 border border-slate-600">
                {{ target.category }}
              </span>
              <span class="text-[11px] font-bold text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded">
                Score {{ target.compositeScore }}
              </span>
            </div>
            <h4
              class="text-sm font-bold truncate transition-colors"
              :class="selectedTargetId === target.id ? 'text-amber-300' : 'text-slate-100 group-hover:text-sky-300'"
            >
              {{ target.name }}
            </h4>
            <p v-if="target.address" class="text-xs text-slate-400 truncate mt-0.5">
              {{ target.address }}
            </p>
          </div>

          <!-- TriShield Visual Indicator -->
          <div class="flex-shrink-0 flex flex-col items-center gap-1">
            <TriShieldIcon
              :air="target.metrics.air.qualifies"
              :road="target.metrics.road.qualifies"
              :time="target.metrics.time.qualifies"
              :size="selectedTargetId === target.id ? 38 : 32"
              :highlighted="selectedTargetId === target.id"
            />
          </div>
        </div>

        <!-- Mode Qualification Badges -->
        <div class="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-700/50 text-[11px]">
          <!-- Air Tag -->
          <span
            class="px-2 py-0.5 rounded-md font-medium transition-all"
            :class="target.metrics.air.qualifies ? 'bg-sky-950/80 text-sky-300 border border-sky-500/50' : 'text-slate-400 opacity-60'"
          >
            Air: ~{{ formatDistance(target.metrics.air.mean) }}
          </span>

          <!-- Road Tag -->
          <span
            class="px-2 py-0.5 rounded-md font-medium transition-all"
            :class="target.metrics.road.qualifies ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50' : 'text-slate-400 opacity-60'"
          >
            Road: ~{{ formatDistance(target.metrics.road.mean) }}
          </span>

          <!-- Time Tag -->
          <span
            class="px-2 py-0.5 rounded-md font-medium transition-all"
            :class="target.metrics.time.qualifies ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50' : 'text-slate-400 opacity-60'"
          >
            Time: ~{{ formatDuration(target.metrics.time.mean) }}
          </span>
        </div>

        <!-- Opening Hours (if present) -->
        <div v-if="target.openingHours?.raw" class="mt-2 flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900/40 p-1.5 rounded-lg border border-slate-700/30">
          <Clock class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span class="truncate font-mono text-[11px]">{{ target.openingHours.raw }}</span>
        </div>

        <!-- Accordion Toggle: Individual Trip Details -->
        <div class="mt-2.5">
          <button
            @click="toggleExpand(target.id, $event)"
            class="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium transition-colors"
          >
            <span>{{ expandedTargetIds.has(target.id) ? 'Hide participant trips' : 'Show trip per attendee' }}</span>
            <component :is="expandedTargetIds.has(target.id) ? ChevronUp : ChevronDown" class="w-3 h-3" />
          </button>

          <!-- Expanded Participant Breakdown -->
          <div
            v-if="expandedTargetIds.has(target.id)"
            class="mt-2 space-y-1.5 pt-2 border-t border-slate-700/60"
          >
            <div
              v-for="(sp, spIdx) in startPoints"
              :key="sp.id"
              class="flex items-center justify-between text-[11px] bg-slate-900/60 px-2.5 py-1.5 rounded-lg"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  :style="{ backgroundColor: sp.color }"
                >
                  {{ spIdx + 1 }}
                </span>
                <span class="truncate text-slate-300">{{ sp.name.split(',')[0] }}</span>
              </div>

              <div class="flex items-center gap-2.5 text-slate-300 font-mono text-[10px] flex-shrink-0">
                <span title="Road Distance">{{ formatDistance(target.metrics.road.individual[spIdx] || 0) }}</span>
                <span class="text-slate-400">•</span>
                <span class="text-amber-400" title="Driving Time">{{ formatDuration(target.metrics.time.individual[spIdx] || 0) }}</span>
              </div>
            </div>

            <!-- Variance / Fairness indicator -->
            <div class="flex justify-between items-center text-[10px] text-slate-400 px-1 pt-1">
              <span>Trip Spread:</span>
              <span>
                ±{{ formatDuration(target.metrics.time.stdDev) }} (Min: {{ formatDuration(target.metrics.time.min) }} / Max: {{ formatDuration(target.metrics.time.max) }})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
