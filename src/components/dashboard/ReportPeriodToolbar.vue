<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatDateOnly } from '@/utils/format';
import {
  bangkokToday,
  selectionLabel,
  validatePeriodSelection,
  type ReportPeriodMode,
  type ReportPeriodSelection,
  type SmartPeriodPreset
} from '@/utils/reportPeriod';

const props = withDefaults(defineProps<{
  mode: ReportPeriodMode | 'SMART_OVERVIEW';
  selection: ReportPeriodSelection;
  displayedLabel?: string;
  actionLabel?: string;
  loading?: boolean;
  disabled?: boolean;
}>(), {
  displayedLabel: 'ยังไม่มีข้อมูล',
  actionLabel: 'ดึงข้อมูลช่วงนี้',
  loading: false,
  disabled: false
});

const emit = defineEmits<{ apply: [selection: ReportPeriodSelection] }>();
const draft = ref<ReportPeriodSelection>({ ...props.selection });
const dateFrom = ref<Date | null>(null);
const dateTo = ref<Date | null>(null);
const expanded = ref(false);
const maxDate = computed(() => new Date(`${bangkokToday()}T00:00:00`));
const presetOptions = computed(() => props.mode === 'AS_OF_DATE'
  ? [
      { label: 'วันนี้', value: 'TODAY_TO_NOW' },
      { label: 'เมื่อวาน', value: 'YESTERDAY' },
      { label: 'เลือกวันที่', value: 'CUSTOM' }
    ]
  : [
      { label: 'วันนี้', value: 'TODAY_TO_NOW' },
      { label: 'เมื่อวาน', value: 'YESTERDAY' },
      { label: 'เดือนนี้', value: 'MONTH_TO_DATE' },
      { label: 'กำหนดช่วงเอง', value: 'CUSTOM' }
    ]);
const validation = computed(() => validatePeriodSelection(draft.value));
const pendingLabel = computed(() => selectionLabel(draft.value, props.mode));
const applyDisabled = computed(() => props.disabled || props.loading || (props.mode !== 'CURRENT_ONLY' && !validation.value.valid));
const mobileToggleLabel = computed(() => props.mode === 'CURRENT_ONLY'
  ? (expanded.value ? 'ปิด' : 'รีเฟรช')
  : (expanded.value ? 'ปิดตัวเลือก' : 'เปลี่ยนช่วง'));

watch(() => props.selection, (selection) => resetDraft(selection), { immediate: true, deep: true });
watch(() => draft.value.periodPreset, (preset) => {
  if (preset !== 'CUSTOM') {
    dateFrom.value = null;
    dateTo.value = null;
    draft.value = { periodPreset: preset };
    return;
  }
  const fallback = new Date(`${bangkokToday()}T00:00:00`);
  dateFrom.value ??= fallback;
  dateTo.value ??= fallback;
  syncCustomDates();
});
watch(dateFrom, () => {
  if (props.mode === 'AS_OF_DATE' && dateFrom.value) dateTo.value = dateFrom.value;
  syncCustomDates();
});
watch(dateTo, syncCustomDates);

function resetDraft(selection: ReportPeriodSelection) {
  draft.value = { ...selection };
  dateFrom.value = selection.dateFrom ? new Date(`${selection.dateFrom}T00:00:00`) : null;
  dateTo.value = selection.dateTo ? new Date(`${selection.dateTo}T00:00:00`) : null;
}

function syncCustomDates() {
  if (draft.value.periodPreset !== 'CUSTOM') return;
  draft.value = {
    periodPreset: 'CUSTOM',
    dateFrom: dateFrom.value ? formatDateOnly(dateFrom.value) : undefined,
    dateTo: dateTo.value ? formatDateOnly(dateTo.value) : undefined
  };
}

function selectPreset(value: SmartPeriodPreset) {
  draft.value = { periodPreset: value };
}

function apply() {
  if (applyDisabled.value) return;
  emit('apply', { ...draft.value });
  expanded.value = false;
}
</script>

<template>
  <section class="card period-toolbar" aria-label="เลือกช่วงข้อมูลรายงาน">
    <div class="period-context">
      <div>
        <span>ข้อมูลที่กำลังแสดง</span>
        <strong>{{ displayedLabel }}</strong>
      </div>
      <i class="pi pi-arrow-right period-context-arrow" aria-hidden="true" />
      <div>
        <span>ช่วงที่จะดึง</span>
        <strong>{{ pendingLabel }}</strong>
      </div>
      <Button
        class="period-mobile-toggle"
        :label="mobileToggleLabel"
        :icon="expanded ? 'pi pi-angle-up' : 'pi pi-calendar'"
        severity="secondary"
        text
        size="small"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      />
    </div>

    <div :class="['period-controls', { 'is-expanded': expanded }]">
      <template v-if="mode === 'CURRENT_ONLY'">
        <div class="current-only-copy">
          <i class="pi pi-bolt" aria-hidden="true" />
          <div><strong>รายงานนี้ใช้สถานะปัจจุบัน</strong><span>ฐานข้อมูลไม่รองรับการดูย้อนหลังตามวันที่</span></div>
        </div>
      </template>
      <template v-else>
        <div class="period-field">
          <label for="shared-period-preset">ช่วงข้อมูล</label>
          <Select
            input-id="shared-period-preset"
            :model-value="draft.periodPreset"
            :options="presetOptions"
            option-label="label"
            option-value="value"
            fluid
            @update:model-value="selectPreset"
          />
        </div>
        <div v-if="draft.periodPreset === 'CUSTOM'" class="period-field">
          <label for="shared-period-from">{{ mode === 'AS_OF_DATE' ? 'วันที่' : 'จากวันที่' }}</label>
          <DatePicker input-id="shared-period-from" v-model="dateFrom" date-format="dd/mm/yy" :max-date="maxDate" show-icon fluid />
        </div>
        <div v-if="draft.periodPreset === 'CUSTOM' && mode !== 'AS_OF_DATE'" class="period-field">
          <label for="shared-period-to">ถึงวันที่</label>
          <DatePicker input-id="shared-period-to" v-model="dateTo" date-format="dd/mm/yy" :max-date="maxDate" show-icon fluid />
        </div>
      </template>
      <Button :label="actionLabel" icon="pi pi-refresh" :loading="loading" :disabled="applyDisabled" @click="apply" />
    </div>

    <Message v-if="mode !== 'CURRENT_ONLY' && validation.message" severity="error" :closable="false" class="period-message">{{ validation.message }}</Message>
    <Message v-else-if="mode !== 'CURRENT_ONLY' && validation.warning" severity="warn" :closable="false" class="period-message">{{ validation.warning }}</Message>
  </section>
</template>

<style scoped>
.period-toolbar { display: grid; gap: 1rem; margin-bottom: 1rem; padding: 1rem 1.25rem; }
.period-context { display: flex; align-items: center; gap: 1rem; min-width: 0; }
.period-context > div { display: grid; gap: .2rem; min-width: 0; }
.period-context span { color: var(--text-color-secondary); font-size: .75rem; }
.period-context strong { overflow-wrap: anywhere; font-size: .9rem; }
.period-context-arrow { color: var(--text-color-secondary); font-size: .75rem; }
.period-controls { display: grid; grid-template-columns: minmax(12rem, 14rem) minmax(11rem, 1fr) minmax(11rem, 1fr) auto; align-items: end; gap: .75rem; padding-top: 1rem; border-top: 1px solid var(--surface-border); }
.period-field { display: grid; gap: .4rem; }
.period-field label { font-size: .8rem; font-weight: 600; }
.current-only-copy { grid-column: 1 / -2; display: flex; align-items: center; gap: .75rem; min-height: 2.75rem; }
.current-only-copy > i { color: var(--primary-color); font-size: 1.1rem; }
.current-only-copy > div { display: grid; gap: .15rem; }
.current-only-copy span { color: var(--text-color-secondary); font-size: .75rem; }
.period-message { margin: 0; }
.period-mobile-toggle { display: none; margin-left: auto; }
@media (max-width: 767px) {
  .period-toolbar { gap: .75rem; padding: 1rem; }
  .period-context { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; }
  .period-context > div:nth-of-type(2), .period-context-arrow { display: none; }
  .period-mobile-toggle { display: inline-flex; }
  .period-controls { display: none; grid-template-columns: 1fr; align-items: stretch; padding-top: .75rem; }
  .period-controls.is-expanded { display: grid; }
  .current-only-copy { grid-column: auto; }
  .period-controls > .p-button { width: 100%; }
}
</style>
