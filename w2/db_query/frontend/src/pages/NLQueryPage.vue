<template>
  <div class="page">
    <div class="panel">
      <h2>自然语言生成 SQL</h2>
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
        <el-form-item label="需求描述">
          <el-input
            v-model="form.prompt"
            type="textarea"
            :rows="4"
            placeholder="例如：统计最近 7 天的订单数，按日期分组"
          />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            placeholder="可选：填写 DeepSeek API Key，否则使用后端默认配置"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="running" @click="run">生成并执行</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>生成的 SQL 与结果</h2>
      </div>
      <el-alert v-if="error" type="error" :closable="false" show-icon class="alert">{{ error }}</el-alert>
      <div v-if="result">
        <p class="sql-line"><strong>SQL:</strong> {{ result.generatedSql }}</p>
        <p v-if="result.message" class="hint">{{ result.message }}</p>
      </div>
      <el-table v-if="tableData.length" :data="tableData" stripe style="width: 100%">
        <el-table-column v-for="col in result?.columns" :key="col" :prop="col" :label="col" />
      </el-table>
      <p v-else class="placeholder">暂无结果</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { nlQuery } from '../services/nl_query'
import { fetchConnectionsApi, type ConnectionOut } from '../services/metadata'

interface NLQueryResult {
  generatedSql: string
  columns: string[]
  rows: any[][]
  limitAdded: boolean
  message?: string
}

const form = reactive({
  connectionId: undefined as number | undefined,
  prompt: '',
  apiKey: '',
})

const running = ref(false)
const error = ref<string | null>(null)
const result = ref<NLQueryResult | null>(null)
const connections = ref<ConnectionOut[]>([])
const loadingConnections = ref(false)

const tableData = computed(() => {
  if (!result.value?.rows) return []
  return result.value.rows.map((row) => {
    const obj: Record<string, any> = {}
    result.value?.columns.forEach((col, idx) => {
      obj[col] = row[idx]
    })
    return obj
  })
})

const run = async () => {
  if (!form.connectionId) {
    ElMessage.error('请选择 Connection')
    return
  }
  if (!form.prompt.trim()) {
    ElMessage.error('请填写需求描述')
    return
  }
  running.value = true
  error.value = null
  try {
    const res = await nlQuery({
      connectionId: form.connectionId,
      prompt: form.prompt,
      apiKey: form.apiKey || undefined,
    })
    result.value = res
    if (res.limitAdded) {
      ElMessage.info('已自动追加 LIMIT')
    }
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || '生成/执行失败'
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
.sql-line {
  margin: 0.5rem 0;
}
</style>

