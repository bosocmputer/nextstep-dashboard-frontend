<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useLayout } from '@/layout/composables/layout';
import type { DashboardVisualization } from '@/api';
import { chartTypeFor, formatDashboardValue, numberForChart, visualizationCategoryLabels } from '@/utils/dashboard';

const props = defineProps<{ visualization: DashboardVisualization; compact?: boolean }>();
const { layoutConfig, isDarkTheme } = useLayout();
const chartData = ref();
const chartOptions = ref();
const type = computed(() => chartTypeFor(props.visualization));
const categoryLabels = computed(() => visualizationCategoryLabels(props.visualization));

const paletteProperties = ['--p-primary-500', '--p-sky-500', '--p-orange-500', '--p-violet-500', '--p-teal-500'];

function setChartOptions() {
  const documentStyle = getComputedStyle(document.documentElement);
  const colors = paletteProperties.map((property) => documentStyle.getPropertyValue(property).trim());
  const textColor = documentStyle.getPropertyValue('--text-color').trim();
  const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary').trim();
  const surfaceBorder = documentStyle.getPropertyValue('--surface-border').trim();
  const horizontal = props.visualization.intent === 'RANKING' || props.visualization.intent === 'EXCEPTION';
  const stacked = props.visualization.intent === 'COMPOSITION';

  chartData.value = {
    labels: categoryLabels.value,
    datasets: props.visualization.series.map((series, index) => ({
      label: series.label,
      data: series.values.map(numberForChart),
      pointLabels: series.pointLabels,
      backgroundColor: colors[index % colors.length],
      borderColor: colors[index % colors.length],
      borderWidth: type.value === 'line' ? 2 : 0,
      borderRadius: type.value === 'bar' ? 5 : 0,
      fill: false,
      tension: 0.3,
      pointRadius: type.value === 'line' ? 2.5 : 0,
      pointHoverRadius: 5
    }))
  };
  chartOptions.value = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: props.visualization.series.length > 1, position: 'bottom', labels: { color: textColor, usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: (context: { dataset: { label?: string }; raw: number | null }) => `${context.dataset.label ? `${context.dataset.label}: ` : ''}${formatDashboardValue(context.raw === null ? undefined : String(context.raw), props.visualization.unit)}`
        }
      }
    },
    scales: {
      x: { stacked, ticks: { color: textColorSecondary, maxRotation: 0, autoSkip: true }, grid: { display: horizontal, color: surfaceBorder } },
      y: { stacked, beginAtZero: true, ticks: { color: textColorSecondary }, grid: { display: !horizontal, color: surfaceBorder } }
    }
  };
}

onMounted(setChartOptions);
watch([() => props.visualization, () => layoutConfig.primary, () => layoutConfig.surface, isDarkTheme], setChartOptions, { deep: true });
</script>

<template>
  <section class="executive-chart" :aria-label="visualization.title">
    <Chart v-if="chartData && visualization.categories.length" :type="type" :data="chartData" :options="chartOptions" :style="{ height: compact ? '17rem' : '21rem' }" />
    <div v-else class="chart-empty"><i class="pi pi-chart-bar" /><span>ยังไม่มีข้อมูลสำหรับกราฟนี้</span></div>
    <p v-if="visualization.note" class="text-xs text-muted-color mt-3 mb-0">{{ visualization.note }}</p>
    <details v-if="visualization.categories.length" class="chart-table mt-3">
      <summary class="text-sm text-primary cursor-pointer">ดูข้อมูลในรูปแบบตาราง</summary>
      <div class="overflow-x-auto mt-3">
        <table>
          <thead><tr><th>รายการ</th><th v-for="series in visualization.series" :key="series.key">{{ series.label }}</th></tr></thead>
          <tbody><tr v-for="(category, categoryIndex) in categoryLabels" :key="`${category}-${categoryIndex}`"><td>{{ category }}</td><td v-for="series in visualization.series" :key="series.key" class="metric-value">{{ formatDashboardValue(series.values[categoryIndex], visualization.unit) }}</td></tr></tbody>
        </table>
      </div>
    </details>
  </section>
</template>

<style scoped>
.chart-empty { min-height: 17rem; display: grid; place-items: center; align-content: center; gap: .75rem; color: var(--text-color-secondary); }
.chart-empty i { font-size: 2rem; }
.chart-table table { width: 100%; border-collapse: collapse; font-size: .875rem; }
.chart-table th, .chart-table td { padding: .65rem .75rem; text-align: left; border-bottom: 1px solid var(--surface-border); white-space: nowrap; }
.chart-table th { color: var(--text-color-secondary); font-weight: 600; }
</style>
