import { apiClient } from './api'

export interface NLQueryPayload {
  connectionId: number
  prompt: string
  apiKey?: string
}

export interface NLQueryResult {
  generatedSql: string
  columns: string[]
  rows: any[][]
  limitAdded: boolean
  message?: string
}

export async function nlQuery(payload: NLQueryPayload): Promise<NLQueryResult> {
  const { data } = await apiClient.post('/nl-query', payload)
  return data
}

