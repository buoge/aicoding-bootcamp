<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Tag = {
  id: number
  name: string
}

type Ticket = {
  id: number
  title: string
  status: string
  tags: Tag[]
}

type TicketListResponse = {
  items: Ticket[]
  total: number
}

const API_BASE = 'http://localhost:8000/api'

const tickets = ref<Ticket[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const search = ref('')
const pageSize = 15
const page = ref(1)
const statusFilter = ref<'all' | 'open' | 'done'>('all')
const tags = ref<Tag[]>([])
const selectedTagIds = ref<number[]>([])
const showCreate = ref(false)
const createTitle = ref('')
const createDescription = ref('')
const createTagIds = ref<number[]>([])
const creating = ref(false)

const maxPage = computed(() => {
  return total.value > 0 ? Math.ceil(total.value / pageSize) : 1
})

async function loadTickets() {
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams()
    const searchValue = search.value.trim()
    if (searchValue) {
      params.set('search', searchValue)
    }
    if (statusFilter.value !== 'all') {
      params.set('status', statusFilter.value)
    }
    if (selectedTagIds.value.length > 0) {
      params.set('tag_ids', selectedTagIds.value.join(','))
    }
    params.set('limit', String(pageSize))
    params.set('offset', String((page.value - 1) * pageSize))
    const query = params.toString()
    const url = query ? `${API_BASE}/tickets?${query}` : `${API_BASE}/tickets`
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`请求失败：${res.status}`)
    }
    const data = (await res.json()) as TicketListResponse
    tickets.value = data.items
    total.value = data.total
  } catch (e: any) {
    error.value = e?.message ?? '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadTags() {
  try {
    const res = await fetch(`${API_BASE}/tags`)
    if (!res.ok) return
    const data = (await res.json()) as Tag[]
    tags.value = data
  } catch {
    // 静默失败即可，标签只是辅助筛选
  }
}

function goToPage(target: number) {
  const next = Math.min(Math.max(target, 1), maxPage.value)
  if (next === page.value) return
  page.value = next
  loadTickets()
}

function resetAndSearch() {
  page.value = 1
  loadTickets()
}

function toggleTag(id: number) {
  if (selectedTagIds.value.includes(id)) {
    selectedTagIds.value = selectedTagIds.value.filter((t) => t !== id)
  } else {
    selectedTagIds.value = [...selectedTagIds.value, id]
  }
  resetAndSearch()
}

function changeStatusFilter(value: 'all' | 'open' | 'done') {
  if (statusFilter.value === value) return
  statusFilter.value = value
  resetAndSearch()
}

function openCreate() {
  createTitle.value = ''
  createDescription.value = ''
  createTagIds.value = []
  showCreate.value = true
}

function closeCreate() {
  if (creating.value) return
  showCreate.value = false
}

async function submitCreate() {
  if (!createTitle.value.trim()) {
    error.value = '标题不能为空'
    return
  }
  creating.value = true
  error.value = null
  try {
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: createTitle.value.trim(),
        description: createDescription.value.trim() || null,
        tag_ids: createTagIds.value,
      }),
    })
    if (!res.ok) {
      throw new Error(`创建失败：${res.status}`)
    }
    showCreate.value = false
    page.value = 1
    await loadTickets()
  } catch (e: any) {
    error.value = e?.message ?? '创建失败'
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadTags(), loadTickets()])
})
</script>

<template>
  <main class="page">
    <header class="header">
      <div>
        <p class="eyebrow">Project Alpha</p>
        <h1>基于标签的 Ticket 管理工具</h1>
        <p class="subtitle">可以按标题关键字搜索 Ticket，数据来自后端 API（/api/tickets）。</p>
      </div>
      <div class="toolbar">
        <input
          v-model="search"
          class="search-input"
          type="search"
          placeholder="按标题搜索 Ticket…"
          @keyup.enter="resetAndSearch"
        />
        <button class="reload" type="button" @click="resetAndSearch" :disabled="loading">
          {{ loading ? '搜索中…' : '搜索 / 刷新' }}
        </button>
        <button class="primary" type="button" @click="openCreate">
          新建 Ticket
        </button>
      </div>
    </header>

    <section class="content">
      <aside class="sidebar">
        <div class="filter-card">
          <h2 class="filter-title">快速过滤</h2>
          <p class="filter-label">状态</p>
          <div class="status-group">
            <button
              type="button"
              class="status-chip"
              :class="{ active: statusFilter === 'all' }"
              @click="changeStatusFilter('all')"
            >
              全部
            </button>
            <button
              type="button"
              class="status-chip"
              :class="{ active: statusFilter === 'open' }"
              @click="changeStatusFilter('open')"
            >
              未完成
            </button>
            <button
              type="button"
              class="status-chip"
              :class="{ active: statusFilter === 'done' }"
              @click="changeStatusFilter('done')"
            >
              已完成
            </button>
          </div>

          <p class="filter-label">标签</p>
          <div class="tags-group" v-if="tags.length > 0">
            <button
              v-for="tag in tags"
              :key="tag.id"
              type="button"
              class="tag-chip"
              :class="{ active: selectedTagIds.includes(tag.id) }"
              @click="toggleTag(tag.id)"
            >
              {{ tag.name }}
            </button>
          </div>
          <p v-else class="filter-empty">暂无标签数据</p>
        </div>
      </aside>

      <div class="content-main">
      <p v-if="error" class="error">加载失败：{{ error }}</p>
      <p v-else-if="loading" class="hint">正在加载 tickets…</p>
      <p v-else-if="tickets.length === 0" class="hint">目前没有任何 Ticket。</p>

      <table v-else class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>标题</th>
            <th>状态</th>
            <th>标签</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ticket in tickets" :key="ticket.id">
            <td class="id-col">#{{ ticket.id }}</td>
            <td class="title-col">{{ ticket.title }}</td>
            <td>
              <span :class="['status', ticket.status === 'done' ? 'status-done' : 'status-open']">
                {{ ticket.status === 'done' ? '已完成' : '未完成' }}
              </span>
            </td>
            <td class="tags-col">
              <span v-if="ticket.tags.length === 0" class="tag tag-empty">无标签</span>
              <span v-for="tag in ticket.tags" :key="tag.id" class="tag">
                {{ tag.name }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <footer v-if="!loading && !error" class="footer">
        <p class="total">共 {{ total }} 条记录，每页 {{ pageSize }} 条</p>
        <nav class="pagination" aria-label="Ticket pagination">
          <button
            type="button"
            class="page-btn"
            :disabled="page === 1"
            @click="goToPage(page - 1)"
          >
            上一页
          </button>
          <span class="page-indicator">
            第 {{ page }} / {{ maxPage }} 页
          </span>
          <button
            type="button"
            class="page-btn"
            :disabled="page === maxPage"
            @click="goToPage(page + 1)"
          >
            下一页
          </button>
        </nav>
      </footer>
      </div>
    </section>

    <div v-if="showCreate" class="modal-backdrop" @click.self="closeCreate">
      <div class="modal">
        <h2 class="modal-title">新建 Ticket</h2>
        <form class="modal-form" @submit.prevent="submitCreate">
          <label class="field">
            <span class="field-label">标题</span>
            <input
              v-model="createTitle"
              type="text"
              class="field-input"
              placeholder="简要描述这个 Ticket"
              required
            />
          </label>

          <label class="field">
            <span class="field-label">描述</span>
            <textarea
              v-model="createDescription"
              rows="3"
              class="field-input field-textarea"
              placeholder="可选：补充详细信息"
            />
          </label>

          <div class="field">
            <span class="field-label">标签</span>
            <div class="tags-group">
              <button
                v-for="tag in tags"
                :key="tag.id"
                type="button"
                class="tag-chip"
                :class="{ active: createTagIds.includes(tag.id) }"
                @click="
                  createTagIds = createTagIds.includes(tag.id)
                    ? createTagIds.filter((t) => t !== tag.id)
                    : [...createTagIds, tag.id]
                "
              >
                {{ tag.name }}
              </button>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="page-btn" @click="closeCreate" :disabled="creating">
              取消
            </button>
            <button type="submit" class="primary" :disabled="creating">
              {{ creating ? '创建中…' : '创建' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 2.5rem 2rem;
  box-sizing: border-box;
  background: #f8fafc;
  color: #0f172a;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #64748b;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

h1 {
  font-size: 1.8rem;
  margin: 0 0 0.4rem;
}

.subtitle {
  margin: 0;
  color: #64748b;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.search-input {
  min-width: 220px;
  border-radius: 999px;
  border: 1px solid #cbd5f5;
  padding: 0.4rem 0.9rem;
  font-size: 0.9rem;
  outline: none;
}

.search-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.35);
}

.primary {
  border-radius: 999px;
  border: none;
  background: #2563eb;
  color: #ffffff;
  padding: 0.5rem 1.3rem;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(37, 99, 235, 0.35);
}

.primary:disabled {
  opacity: 0.7;
  cursor: default;
  box-shadow: none;
}

.reload {
  border-radius: 999px;
  border: none;
  background: #2563eb;
  color: #fff;
  padding: 0.5rem 1.2rem;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.25);
}
.reload:disabled {
  opacity: 0.6;
  cursor: default;
  box-shadow: none;
}

.content {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1.25rem;
}

.hint {
  margin: 0;
  color: #64748b;
}

.error {
  margin: 0 0 0.75rem;
  color: #b91c1c;
}

.sidebar {
  align-self: flex-start;
}

.filter-card {
  background: #ffffff;
  border-radius: 1rem;
  padding: 1.25rem 1.25rem 1.1rem;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.06);
}

.filter-title {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
}

.filter-label {
  margin: 0.75rem 0 0.4rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #9ca3af;
}

.status-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.status-chip {
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: #ffffff;
  padding: 0.2rem 0.8rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.status-chip.active {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.tags-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag-chip {
  border-radius: 999px;
  border: 1px solid rgba(209, 213, 219, 0.9);
  background: #f9fafb;
  padding: 0.17rem 0.7rem;
  font-size: 0.78rem;
  cursor: pointer;
}

.tag-chip.active {
  border-color: #111827;
  background: #111827;
  color: #ffffff;
}

.filter-empty {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: #9ca3af;
}

.content-main {
  background: #fff;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.06);
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.75rem;
}

.table thead {
  background: #eff4ff;
}

.table th,
.table td {
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  text-align: left;
}

.table tbody tr:nth-child(even) {
  background: #f9fafb;
}

.id-col {
  width: 70px;
  color: #6b7280;
}

.title-col {
  font-weight: 500;
}

.tags-col {
  max-width: 260px;
}

.status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
}

.status-open {
  background: #fef3c7;
  color: #92400e;
}

.status-done {
  background: #dcfce7;
  color: #166534;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
  font-size: 0.75rem;
  margin-right: 0.25rem;
  margin-bottom: 0.25rem;
}

.tag-empty {
  background: #f3f4f6;
  color: #9ca3af;
}

.total {
  margin: 0;
  font-size: 0.85rem;
  color: #6b7280;
}

.footer {
  margin-top: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-btn {
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  padding: 0.25rem 0.8rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.page-indicator {
  font-size: 0.85rem;
  color: #4b5563;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 20;
}

.modal {
  width: 100%;
  max-width: 520px;
  background: #ffffff;
  border-radius: 1.25rem;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.5);
  padding: 1.75rem 1.75rem 1.5rem;
}

.modal-title {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field-label {
  font-size: 0.85rem;
  color: #6b7280;
}

.field-input {
  border-radius: 0.75rem;
  border: 1px solid #d1d5db;
  padding: 0.45rem 0.75rem;
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
}

.field-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.35);
}

.field-textarea {
  min-height: 80px;
}

.modal-actions {
  margin-top: 0.75rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .page {
    padding-inline: 1rem;
  }

  .content {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
