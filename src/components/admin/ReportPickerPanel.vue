<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AdminReportDefinition, ReportKey } from '@/api';

const props = withDefaults(defineProps<{
  definitions: AdminReportDefinition[];
  modelValue: ReportKey[];
  maxSelected?: number;
  ordered?: boolean;
  disabled?: boolean;
}>(), { maxSelected: 0, ordered: false, disabled: false });

const emit = defineEmits<{ 'update:modelValue': [value: ReportKey[]] }>();
const search = ref('');
const category = ref<string>();
const selectedOnly = ref(false);
const limitMessage = ref('');

const selectedSet = computed(() => new Set<ReportKey>(props.modelValue));
const definitionsByKey = computed(() => new Map(props.definitions.map((item) => [item.reportKey, item])));
const categories = computed(() => {
  const labels = new Map<string, string>();
  props.definitions.forEach((item) => labels.set(item.category, item.categoryLabel));
  return [{ label: 'ทุกหมวด', value: undefined }, ...Array.from(labels, ([value, label]) => ({ value, label }))];
});
const filtered = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase('th-TH');
  return props.definitions.filter((item) =>
    (!category.value || item.category === category.value) &&
    (!selectedOnly.value || selectedSet.value.has(item.reportKey)) &&
    (!needle || item.label.toLocaleLowerCase('th-TH').includes(needle) || item.categoryLabel.toLocaleLowerCase('th-TH').includes(needle))
  );
});
const selectedDefinitions = computed(() => props.modelValue
  .map((key) => definitionsByKey.value.get(key))
  .filter((item): item is AdminReportDefinition => !!item));

function setSelection(next: ReportKey[]) {
  limitMessage.value = '';
  emit('update:modelValue', next);
}

function toggle(item: AdminReportDefinition, checked: boolean) {
  if (props.disabled) return;
  if (checked) {
    if (item.status !== 'ACTIVE') return;
    if (props.maxSelected > 0 && props.modelValue.length >= props.maxSelected) {
      limitMessage.value = `เลือกได้สูงสุด ${props.maxSelected} รายงาน`;
      return;
    }
    if (!selectedSet.value.has(item.reportKey)) setSelection([...props.modelValue, item.reportKey]);
    return;
  }
  setSelection(props.modelValue.filter((key) => key !== item.reportKey));
}

function selectFiltered() {
  if (props.disabled) return;
  const next = [...props.modelValue];
  const nextSet = new Set(next);
  for (const item of filtered.value) {
    if (item.status !== 'ACTIVE' || nextSet.has(item.reportKey)) continue;
    if (props.maxSelected > 0 && next.length >= props.maxSelected) break;
    next.push(item.reportKey);
    nextSet.add(item.reportKey);
  }
  if (props.maxSelected > 0 && filtered.value.some((item) => item.status === 'ACTIVE' && !nextSet.has(item.reportKey))) {
    limitMessage.value = `เลือกได้สูงสุด ${props.maxSelected} รายงาน`;
  }
  emit('update:modelValue', next);
}

function move(index: number, direction: -1 | 1) {
  if (props.disabled) return;
  const target = index + direction;
  if (target < 0 || target >= props.modelValue.length) return;
  const next = [...props.modelValue];
  [next[index], next[target]] = [next[target]!, next[index]!];
  setSelection(next);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Toolbar class="border-0 p-0">
      <template #start>
        <div class="flex flex-wrap items-center gap-2">
          <IconField><InputIcon class="pi pi-search" /><InputText v-model="search" aria-label="ค้นหารายงาน" placeholder="ค้นหาชื่อรายงาน" :disabled="disabled" /></IconField>
          <Select v-model="category" aria-label="กรองหมวดรายงาน" :options="categories" option-label="label" option-value="value" class="w-48" :disabled="disabled" />
          <div class="flex items-center gap-2"><Checkbox v-model="selectedOnly" input-id="selected-only" binary :disabled="disabled" /><label for="selected-only">เฉพาะที่เลือก</label></div>
        </div>
      </template>
      <template #end><div class="flex gap-2"><Button label="เลือกผลที่กรอง" icon="pi pi-check-square" outlined :disabled="disabled" @click="selectFiltered" /><Button label="ล้างที่เลือก" icon="pi pi-times" text severity="secondary" :disabled="disabled || !modelValue.length" @click="setSelection([])" /></div></template>
    </Toolbar>

    <Message v-if="limitMessage" severity="warn" :closable="false">{{ limitMessage }}</Message>
    <div class="grid grid-cols-1 gap-5" :class="ordered ? 'xl:grid-cols-[minmax(0,1fr)_22rem]' : ''">
      <DataTable :value="filtered" data-key="reportKey" paginator :rows="25" :rows-per-page-options="[25, 50, 100]" striped-rows responsive-layout="scroll">
        <Column header="เลือก" style="width: 5rem">
          <template #body="{ data }"><Checkbox :model-value="selectedSet.has(data.reportKey)" binary :disabled="disabled || (data.status === 'DEPRECATED' && !selectedSet.has(data.reportKey))" :aria-label="`เลือก ${data.label}`" @update:model-value="toggle(data, $event)" /></template>
        </Column>
        <Column field="label" header="รายงาน"><template #body="{ data }"><span class="font-medium">{{ data.label }}</span><Tag v-if="data.status === 'DEPRECATED'" value="เลิกใช้" severity="warn" class="ml-2" /></template></Column>
        <Column field="categoryLabel" header="หมวด"><template #body="{ data }"><Tag :value="data.categoryLabel" severity="secondary" /></template></Column>
        <template #empty><div class="py-8 text-center text-muted-color">ไม่พบรายงานที่ตรงกับเงื่อนไข</div></template>
      </DataTable>

      <div v-if="ordered" class="border border-surface rounded-md p-4 self-start">
        <div class="flex items-center justify-between mb-3"><h3 class="text-base font-semibold m-0">ลำดับใน LINE Card</h3><Badge :value="`${modelValue.length}/${maxSelected}`" /></div>
        <div v-if="selectedDefinitions.length" class="flex flex-col gap-2">
          <div v-for="(item, index) in selectedDefinitions" :key="item.reportKey" class="flex items-center gap-2 p-2 border-bottom-1 surface-border">
            <span class="font-medium flex-1">{{ index + 1 }}. {{ item.label }}</span>
            <Button icon="pi pi-angle-up" text rounded size="small" :disabled="disabled || index === 0" :aria-label="`เลื่อน ${item.label} ขึ้น`" @click="move(index, -1)" />
            <Button icon="pi pi-angle-down" text rounded size="small" :disabled="disabled || index === selectedDefinitions.length - 1" :aria-label="`เลื่อน ${item.label} ลง`" @click="move(index, 1)" />
          </div>
        </div>
        <p v-else class="text-muted-color m-0">เลือกรายงานจากตาราง</p>
      </div>
    </div>
    <div class="text-sm text-muted-color">เลือกแล้ว {{ modelValue.length }} จาก {{ definitions.length }} รายงาน</div>
  </div>
</template>
