<template>
  <div class="page">
    <div class="panel">
      <h2>添加连接并同步元数据</h2>
      <el-form :model="form" label-width="120px" class="form">
        <el-form-item label="Connection URL">
          <el-input v-model="form.connectionUrl" placeholder="postgresql://user:pass@host:port/db" />
        </el-form-item>
        <el-form-item label="Name (可选)">
          <el-input v-model="form.name" placeholder="给连接起个名字" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="syncing" @click="syncMetadata">同步元数据</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>连接列表</h2>
        <el-button size="small" :loading="loadingList" @click="fetchConnections">刷新</el-button>
      </div>
      <el-table :data="connections" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="Name" />
        <el-table-column prop="connectionUrl" label="Connection URL" />
        <el-table-column prop="lastSynced" label="Last Synced" />
        <el-table-column width="200" label="操作">
          <template #default="scope">
            <el-button size="small" @click="loadMetadata(scope.row.id)">查看元数据</el-button>
            <el-button size="small" type="primary" @click="editName(scope.row)">编辑名称</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="panel" v-if="metadataTables.length">
      <div class="panel-header">
        <h2>元数据详情</h2>
      </div>
      <el-table :data="metadataTables" stripe>
        <el-table-column prop="schema" label="Schema" width="140" />
        <el-table-column prop="name" label="Table/View" />
        <el-table-column prop="is_view" label="Is View" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.is_view ? 'info' : 'success'">
              {{ scope.row.is_view ? 'VIEW' : 'TABLE' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Columns">
          <template #default="scope">
            <div class="cols">
              <span v-for="(col, idx) in scope.row.columns" :key="idx" class="col-chip">
                {{ col.name }} ({{ col.data_type }})
              </span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon class="alert">{{ error }}</el-alert>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fetchConnectionsApi, syncMetadataApi, getMetadataApi, updateConnectionNameApi } from '../services/metadata'

interface Connection {
  id: number
  name?: string
  connectionUrl: string
  lastSynced?: string
}

interface ColumnInfo {
  name: string
  data_type: string
}

interface TableInfo {
  schema: string
  name: string
  is_view: boolean
  columns: ColumnInfo[]
}

const form = ref({
  connectionUrl: '',
  name: '',
})

const connections = ref<Connection[]>([])
const metadataTables = ref<TableInfo[]>([])
const loadingList = ref(false)
const syncing = ref(false)
const error = ref<string | null>(null)

const fetchConnections = async () => {
  loadingList.value = true
  error.value = null
  try {
    const res = await fetchConnectionsApi()
    connections.value = res
  } catch (e: any) {
    error.value = e?.message ?? '加载连接失败'
  } finally {
    loadingList.value = false
  }
}

const syncMetadata = async () => {
  if (!form.value.connectionUrl.trim()) {
    ElMessage.error('请填写 Connection URL')
    return
  }
  syncing.value = true
  error.value = null
  try {
    const res = await syncMetadataApi({
      connectionUrl: form.value.connectionUrl,
      name: form.value.name || undefined,
      refresh: true,
    })
    ElMessage.success('同步成功')
    await fetchConnections()
    metadataTables.value = res.tables
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || '同步失败'
  } finally {
    syncing.value = false
  }
}

const loadMetadata = async (connectionId: number) => {
  error.value = null
  try {
    const res = await getMetadataApi(connectionId)
    metadataTables.value = res.tables
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || '加载元数据失败'
  }
}

const editName = async (row: Connection) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的名称', '编辑名称', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: row.name || '',
    })
    await updateConnectionNameApi(row.id, { name: value || undefined })
    ElMessage.success('更新成功')
    await fetchConnections()
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return
    error.value = e?.response?.data?.detail || e?.message || '更新失败'
  }
}

fetchConnections()
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
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.form {
  max-width: 720px;
}
.cols {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.col-chip {
  background: #f3f4f6;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 12px;
}
.alert {
  margin-top: 0.5rem;
}
</style>

