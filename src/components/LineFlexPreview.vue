<script setup lang="ts">
import { computed } from 'vue';
import type { FlexPreview } from '@/api';
import { formatDateTime } from '@/utils/format';

const props = defineProps<{ preview: FlexPreview }>();
const payloadSize = computed(() => `${(props.preview.payloadBytes / 1024).toFixed(1)} KB`);
type PreviewReport = FlexPreview['reports'][number];
function primaryFor(report: PreviewReport) { return report.primary ?? report.metrics[1] ?? report.metrics[0]; }
function supportingFor(report: PreviewReport) { return report.supporting ?? report.metrics.filter((item) => item !== primaryFor(report)); }
</script>

<template>
  <section class="flex-preview-shell" aria-label="ตัวอย่าง LINE Flex Message">
    <div class="flex-preview-meta">
      <div>
        <span class="font-semibold">ตัวอย่าง Card จาก Backend</span>
        <p class="m-0 mt-1 text-sm text-muted-color">ตัวเลขสมมติเท่านั้น · ไม่ดึงข้อมูลจาก SML</p>
      </div>
      <Tag severity="secondary" :value="payloadSize" />
    </div>

    <article class="flex-preview-card">
      <header class="flex-preview-header"><strong>NEXTSTEP DASHBOARD</strong><span>สรุปผู้บริหาร</span></header>
      <div class="flex-preview-body">
        <h3>{{ preview.tenantName }}</h3>
        <p class="flex-preview-period">{{ preview.periodLabel }}</p>
        <p class="flex-preview-count">{{ preview.reports.length }} รายงาน</p>
        <section v-for="report in preview.reports" :key="report.key" class="flex-preview-report">
          <span v-if="report.categoryLabel" class="flex-preview-category">{{ report.categoryLabel }}</span>
          <h4>{{ report.label }} <i class="pi pi-angle-right" /></h4>
          <div v-if="primaryFor(report)" class="flex-preview-metric primary">
            <span>{{ primaryFor(report)?.label }}</span>
            <strong>{{ primaryFor(report)?.value }}</strong>
          </div>
          <p v-if="report.comparison" class="flex-preview-comparison">{{ report.comparison.text }}</p>
          <div v-for="metric in supportingFor(report)" :key="metric.label" class="flex-preview-metric">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </div>
          <p v-if="report.attention" class="flex-preview-attention" :data-severity="report.attention.severity">{{ report.attention.text }}</p>
        </section>
        <p class="flex-preview-generated">สร้างเมื่อ {{ formatDateTime(preview.generatedAt) }}</p>
      </div>
      <footer class="flex-preview-footer">
        <span role="button" aria-disabled="true">เปิดภาพรวมร้าน</span>
      </footer>
    </article>
    <p class="m-0 text-xs text-muted-color safe-wrap">Alt text: {{ preview.altText }}</p>
  </section>
</template>

<style scoped>
.flex-preview-shell {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--surface-border);
  border-radius: 0.875rem;
  background: var(--surface-50);
}

.flex-preview-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.flex-preview-card {
  width: min(100%, 420px);
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid #dbe3eb;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 10px 28px rgb(15 23 42 / 10%);
  color: #0f172a;
}

.flex-preview-header {
  display: grid;
  gap: 0.2rem;
  padding: 1rem;
  background: #0f766e;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.flex-preview-header span { color: #ccfbf1; font-size: 0.72rem; }

.flex-preview-body { padding: 1.125rem; }
.flex-preview-body h3 { margin: 0; font-size: 1.25rem; }
.flex-preview-period { margin: 0.35rem 0 0; color: #64748b; font-size: 0.875rem; }
.flex-preview-count { margin: 0.25rem 0 0; color: #94a3b8; font-size: 0.72rem; }

.flex-preview-report {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: #f8fafc;
}

.flex-preview-category { display: block; margin-bottom: 0.45rem; color: #64748b; font-size: 0.68rem; font-weight: 700; }
.flex-preview-report h4 { display: flex; justify-content: space-between; gap: 0.5rem; margin: 0 0 0.55rem; color: #0f766e; font-size: 0.9rem; }
.flex-preview-metric { display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.35rem; font-size: 0.875rem; }
.flex-preview-metric span { color: #475569; }
.flex-preview-metric strong { text-align: right; font-variant-numeric: tabular-nums; }
.flex-preview-metric.primary strong { font-size: 0.95rem; }
.flex-preview-comparison { margin: 0.25rem 0 0; color: #64748b; font-size: 0.72rem; }
.flex-preview-attention { margin: 0.55rem 0 0; padding: 0.45rem 0.55rem; border-radius: 0.4rem; background: #e2e8f0; color: #475569; font-size: 0.72rem; font-weight: 700; }
.flex-preview-attention[data-severity="WARNING"] { background: #fef3c7; color: #92400e; }
.flex-preview-attention[data-severity="DANGER"] { background: #fee2e2; color: #b91c1c; }
.flex-preview-generated { margin: 1rem 0 0; color: #94a3b8; font-size: 0.72rem; }
.flex-preview-footer { padding: 0 1rem 1rem; }
.flex-preview-footer span { display: block; padding: 0.65rem; border-radius: 0.45rem; background: #0f766e; color: #fff; text-align: center; font-size: 0.875rem; font-weight: 600; }

@media (max-width: 480px) {
  .flex-preview-shell { padding: 0.75rem; }
  .flex-preview-meta { align-items: stretch; flex-direction: column; }
}
</style>
