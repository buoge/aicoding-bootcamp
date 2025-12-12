<template>
  <div class="layout">
    <el-menu mode="horizontal" :default-active="active" @select="onSelect">
      <el-menu-item index="metadata">元数据</el-menu-item>
      <el-menu-item index="query">受控 SQL</el-menu-item>
    </el-menu>
    <div class="content">
      <MetadataPage v-if="active === 'metadata'" />
      <QueryPage v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import MetadataPage from './pages/MetadataPage.vue'
import QueryPage from './pages/QueryPage.vue'

const active = ref<'metadata' | 'query'>('metadata')
const onSelect = (key: string) => {
  active.value = key as 'metadata' | 'query'
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

