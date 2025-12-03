# Project Alpha Backend

FastAPI 服务，负责提供 ticket/tag 相关 API。

## 本地开发

1. 创建并激活虚拟环境（可选）。
2. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```
3. 设置数据库（默认使用 `postgresql://postgres:postgres@localhost:5432/projectalpha`）。
4. 初始化数据库表（首次运行时）：
   ```bash
   cd backend
   python -m app.db.init_db
   ```
5. 启动服务：
   ```bash
   uvicorn app.main:app --reload
   ```
5. 打开 `http://localhost:8000/docs` 查看接口文档。

后续阶段会在该项目中增加数据库模型、路由与业务逻辑。

