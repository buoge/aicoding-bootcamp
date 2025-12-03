# Project Alpha

Project Alpha 是一个基于标签的 Ticket 管理工具。此目录包含后端（FastAPI）与前端（Vue3 + Vite）项目。

## 目录结构

```
w1/project-alpha
├── backend/   # FastAPI 应用
└── frontend/  # Vite + Vue3 应用
```

## 快速开始

### 后端

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # 可选
pip install -r requirements.txt
uvicorn app.main:app --reload
```

默认数据库连接：`postgresql://postgres:postgres@localhost:5432/projectalpha`。

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`，并且会在后续阶段与后端 API 进行联调。

