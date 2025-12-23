<template>
  <div class="layout">
    <el-menu mode="horizontal" :default-active="active" @select="onSelect">
      <el-menu-item index="metadata">元数据</el-menu-item>
      <el-menu-item index="query">受控 SQL</el-menu-item>
      <el-menu-item index="nl">NL → SQL</el-menu-item>
    </el-menu>
    <div class="content">
      <MetadataPage v-if="active === 'metadata'" />
      <QueryPage v-else-if="active === 'query'" />
      <NLQueryPage v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import MetadataPage from './pages/MetadataPage.vue'
import QueryPage from './pages/QueryPage.vue'
import NLQueryPage from './pages/NLQueryPage.vue'

const active = ref<'metadata' | 'query' | 'nl'>('metadata')
const onSelect = (key: string) => {
  active.value = key as 'metadata' | 'query' | 'nl'
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
  background: #f5f7fb;
}
.content {
  padding: 1rem;
}
</style>

