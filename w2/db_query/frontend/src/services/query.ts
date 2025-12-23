import { apiClient } from './api'

export interface RunQueryPayload {
  connectionId: number
  sql: string
}

export interface QueryResult {
  columns: { name: string; type?: string }[]
  rows: any[][]
  limitAdded: boolean
  message?: string
}

export async function runQuery(payload: RunQueryPayload): Promise<QueryResult> {
  const { data } = await apiClient.post('/query', payload)
  return data
}

