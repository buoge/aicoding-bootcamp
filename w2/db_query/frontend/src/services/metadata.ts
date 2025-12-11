import { apiClient } from './api'

export interface SyncPayload {
  connectionUrl: string
  name?: string
  refresh?: boolean
}

export interface ConnectionOut {
  id: number
  name?: string
  connectionUrl: string
  lastSynced?: string
}

export interface ColumnInfo {
  name: string
  data_type: string
}

export interface TableInfo {
  schema: string
  name: string
  is_view: boolean
  columns: ColumnInfo[]
}

export interface MetadataResponse {
  connection: ConnectionOut
  tables: TableInfo[]
}

export async function syncMetadataApi(payload: SyncPayload): Promise<MetadataResponse> {
  const { data } = await apiClient.post('/metadata/sync', payload)
  return data
}

export async function fetchConnectionsApi(): Promise<ConnectionOut[]> {
  const { data } = await apiClient.get('/metadata')
  return data
}

export async function getMetadataApi(connectionId: number): Promise<MetadataResponse> {
  const { data } = await apiClient.get(`/metadata/${connectionId}`)
  return data
}

