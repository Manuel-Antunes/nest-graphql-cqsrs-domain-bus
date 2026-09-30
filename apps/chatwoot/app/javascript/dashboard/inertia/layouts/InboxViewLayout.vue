<script setup>
// Persistent layout for the inbox-view ("Caixa de Entrada"). InboxList (the notification
// list) fetches only on mount + filter change and reacts to the selected item from the
// URL without refetching — so keeping it mounted here (a LAYOUT, not the page) stops it
// re-fetching every time an item is opened/switched. The page (empty-state or the
// conversation detail) renders into InboxList's default slot via <slot/>.
import InboxListView from 'dashboard/routes/dashboard/inbox/InboxList.vue';
</script>

<template>
  <InboxListView>
    <slot />
  </InboxListView>
</template>
