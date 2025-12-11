import axios from 'axios'

export const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (resp) => resp,
  (error) => {
    // 简单错误透传，后续可扩展统一提示
    return Promise.reject(error)
  }
)

