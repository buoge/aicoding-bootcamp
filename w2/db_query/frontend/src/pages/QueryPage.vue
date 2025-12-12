<template>
  <div class="page">
    <div class="panel">
      <h2>手写 SQL 受控执行</h2>
      <el-form :model="form" label-width="120px" class="form">
        <el-form-item label="Connection">
          <el-select
            v-model="form.connectionId"
            placeholder="请选择连接"
            filterable
            style="min-width: 260px"
            :loading="loadingConnections"
          >
            <el-option
              v-for="conn in connections"
              :key="conn.id"
              :label="conn.name || conn.connectionUrl"
              :value="conn.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="SQL">
          <el-input
            v-model="form.sql"
            type="textarea"
            :rows="6"
            placeholder="只允许 SELECT，若无 LIMIT 将自动追加 1000"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="running" @click="run">执行</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>结果</h2>
        <span v-if="result?.limitAdded" class="hint">已自动追加 LIMIT 1000</span>
      </div>
      <el-alert v-if="error" type="error" :closable="false" show-icon class="alert">{{ error }}</el-alert>
      <el-table v-if="result?.rows?.length" :data="tableData" stripe style="width: 100%">
        <el-table-column
          v-for="col in result?.columns"
          :key="col.name"
          :prop="col.name"
          :label="col.name"
        />
      </el-table>
      <p v-else class="placeholder">暂无结果</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { runQuery } from '../services/query'
import { fetchConnectionsApi, type ConnectionOut } from '../services/metadata'

interface QueryResult {
  columns: { name: string; type?: string }[]
  rows: any[][]
  limitAdded: boolean
  message?: string
}

const form = reactive({
  connectionId: undefined as number | undefined,
  sql: 'select 1',
})

const running = ref(false)
const error = ref<string | null>(null)
const result = ref<QueryResult | null>(null)
const connections = ref<ConnectionOut[]>([])
const loadingConnections = ref(false)

const tableData = computed(() => {
  if (!result.value?.rows) return []
  return result.value.rows.map((row) => {
    const obj: Record<string, any> = {}
    result.value?.columns.forEach((col, idx) => {
      obj[col.name] = row[idx]
    })
    return obj
  })
})

const run = async () => {
  if (!form.connectionId) {
    ElMessage.error('请选择 Connection')
    return
  }
  if (!form.sql.trim()) {
    ElMessage.error('请填写 SQL')
    return
  }
  running.value = true
  error.value = null
  try {
    const res = await runQuery({ connectionId: form.connectionId, sql: form.sql })
    result.value = res
    if (res.message) ElMessage.info(res.message)
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || '执行失败'
  } finally {
    running.value = false
  }
}

const loadConnections = async () => {
  loadingConnections.value = true
  try {
    const res = await fetchConnectionsApi()
    connections.value = res
    if (!form.connectionId && res.length > 0) {
      form.connectionId = res[0].id
    }
  } catch (e: any) {
    error.value = e?.message ?? '加载连接列表失败'
  } finally {
    loadingConnections.value = false
  }
}

onMounted(() => {
  loadConnections()
})
</script>

<style scoped>
.page {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.form {
  max-width: 720px;
}
.placeholder {
  color: #6b7280;
}
.hint {
  color: #2563eb;
  font-size: 0.9rem;
}
.alert {
  margin-top: 0.5rem;
}
</style>

