<script setup lang="ts">
import { useLayout } from '@/layout/composables/layout';
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { NavigationItem } from './menu';
import AppMenu from './AppMenu.vue';

defineProps<{ model: NavigationItem[] }>();

const { layoutState, isDesktop, hasOpenOverlay } = useLayout();
const route = useRoute();
const sidebarRef = ref<HTMLElement | null>(null);
let outsideClickListener: ((event: MouseEvent) => void) | null = null;

watch(
    () => route.path,
    (newPath) => {
        if (isDesktop()) layoutState.activePath = null;
        else layoutState.activePath = newPath;

        layoutState.overlayMenuActive = false;
        layoutState.mobileMenuActive = false;
        layoutState.menuHoverActive = false;
    },
    { immediate: true }
);

watch(hasOpenOverlay, (newVal) => {
    if (isDesktop()) {
        if (newVal) bindOutsideClickListener();
        else unbindOutsideClickListener();
    }
});

const bindOutsideClickListener = () => {
    if (!outsideClickListener) {
        outsideClickListener = (event: MouseEvent) => {
            if (isOutsideClicked(event)) {
                layoutState.overlayMenuActive = false;
            }
        };

        document.addEventListener('click', outsideClickListener);
    }
};

const unbindOutsideClickListener = () => {
    if (outsideClickListener) {
        document.removeEventListener('click', outsideClickListener);
        outsideClickListener = null;
    }
};

const isOutsideClicked = (event: MouseEvent) => {
    const topbarButtonEl = document.querySelector('.layout-menu-button');
    const sidebar = sidebarRef.value;

    return !(sidebar?.isSameNode(event.target as Node) || sidebar?.contains(event.target as Node) || topbarButtonEl?.isSameNode(event.target as Node) || topbarButtonEl?.contains(event.target as Node));
};

onBeforeUnmount(() => {
    unbindOutsideClickListener();
});
</script>

<template>
    <div ref="sidebarRef" class="layout-sidebar">
        <AppMenu :model="model" />
    </div>
</template>
