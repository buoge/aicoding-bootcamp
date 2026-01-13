# Postgres MCP Server 设计文档

## 1. 系统架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────┐
│         User Interface                          │
│     (Claude Desktop / IDE)                      │
└────────────────────────┬────────────────────────┘
                         │ MCP Protocol
                         ▼
┌─────────────────────────────────────────────────┐
│           Postgres MCP Server                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ FastMCP  │  │ Service  │  │ Database │      │
│  │  Server  │◄─┤  Layer   │◄─┤ Manager  │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│         │            │            │             │
│         │            │            │             │
│         ▼            ▼            ▼             │
│  ┌─────────────────────────────────────────┐    │
│  │         Core Components                 │    │
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐   │    │
│  │  │SQL  │  │LLM  │  │Query│  │Config│  │    │
│  │  │Cache│  │Serv│  │Exec │  │Manage│  │    │
│  │  └─────┘  └─────┘  └─────┘  └─────┘   │    │
│  └─────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌──────────────┐  ┌─────────────┐  ┌──────────┐
│ PostgreSQL   │  │  Kimi-K2    │  │  Schema  │
│ Databases    │  │  API (LLM)  │  │  Cache   │
└──────────────┘  └─────────────┘  └──────────┘
```

### 1.2 组件说明

| 组件 | 技术选型 | 职责 |
|------|---------|------|
| FastMCP Server | `mcp` Python SDK | 处理 MCP 协议，接收用户请求 |
| Service Layer | Custom | 业务逻辑编排 |
| Database Manager | `asyncpg` | 数据库连接池管理 |
| SQL Cache | `LRU Dict` | SQL 查询缓存 |
| LLM Service | `openai` client | 调用 Kimi-K2 API |
| Query Executor | `asyncpg` | SQL 执行和结果处理 |
| Schema Manager | `asyncpg` | Schema 发现和管理 |
| Config Manager | `pydantic` | 配置加载和验证 |

### 1.3 技术栈映射

```
MCP Framework:    FastMCP
Database Driver:  asyncpg
SQL Parser:       SQLGlot (for validation)
LLM Client:       openai Python client
Schema Cache:     Python dict
Configuration:    pydantic + YAML
Logging:          Python logging
```

## 2. 核心模块设计

### 2.1 数据库管理模块

```python
# database/manager.py
import asyncpg
from typing import Optional

class DatabaseManager:
    """管理数据库连接池"""

    def __init__(self):
        self._pools: dict[str, asyncpg.Pool] = {}

    async def connect(self, db_id: str, config: dict) -> bool:
        """连接数据库"""
        try:
            pool = await asyncpg.create_pool(
                host=config['host'],
                port=config.get('port', 5432),
                database=config['database'],
                user=config['user'],
                password=config['password'],
                min_size=1,
                max_size=5
            )
            self._pools[db_id] = pool
            return True
        except Exception as e:
            print(f"Failed to connect to {db_id}: {e}")
            return False

    def get_pool(self, db_id: str) -> Optional[asyncpg.Pool]:
        """获取数据库连接池"""
        return self._pools.get(db_id)

    async def close(self, db_id: str):
        """关闭数据库连接"""
        if db_id in self._pools:
            await self._pools[db_id].close()
            del self._pools[db_id]

    async def close_all(self):
        """关闭所有连接"""
        for pool in self._pools.values():
            await pool.close()
        self._pools.clear()

# database/schema.py
class SchemaManager:
    """管理数据库Schema"""

    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager
        self._schema_cache: dict[str, dict] = {}

    async def get_schema(self, db_id: str) -> dict:
        """获取数据库Schema（带缓存）"""
        if db_id in self._schema_cache:
            return self._schema_cache[db_id]

        schema = await self._discover_schema(db_id)
        self._schema_cache[db_id] = schema
        return schema

    async def refresh_schema(self, db_id: str) -> dict:
        """刷新Schema缓存"""
        schema = await self._discover_schema(db_id)
        self._schema_cache[db_id] = schema
        return schema

    async def _discover_schema(self, db_id: str) -> dict:
        """发现数据库Schema"""
        pool = self.db_manager.get_pool(db_id)
        if not pool:
            raise ValueError(f"Database {db_id} not connected")

        async with pool.acquire() as conn:
            # 获取所有表信息
            tables = await conn.fetch("""
                SELECT table_name, table_schema
                FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            """)

            schema = {'tables': {}}

            for table in tables:
                table_name = f"{table['table_schema']}.{table['table_name']}"

                # 获取列信息
                columns = await conn.fetch("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = $1 AND table_name = $2
                    ORDER BY ordinal_position
                """, table['table_schema'], table['table_name'])

                schema['tables'][table_name] = {
                    'columns': [dict(col) for col in columns]
                }

            return schema

    def get_schema_text(self, db_id: str, max_tables: int = 20) -> str:
        """获取Schema文本，用于Prompt"""
        schema = self._schema_cache.get(db_id, {})

        text = "Database Schema:\n\n"
        tables = list(schema.get('tables', {}).keys())[:max_tables]

        for table_name in tables:
            text += f"Table: {table_name}\n"
            columns = schema['tables'][table_name]['columns']
            for col in columns:
                nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
                text += f"  - {col['column_name']}: {col['data_type']} {nullable}\n"
            text += "\n"

        return text
```

### 2.2 LLM 服务模块

```python
# llm/service.py
from openai import AsyncOpenAI
from typing import Optional
import json

class LLMService:
    """LLM服务，集成Kimi-K2"""

    def __init__(self, api_key: str, base_url: str = "https://api.moonshot.cn/v1"):
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.system_prompt = self._load_system_prompt()

    def _load_system_prompt(self) -> str:
        """加载系统Prompt"""
        return """You are a PostgreSQL SQL expert. Convert natural language queries into valid SQL.

Rules:
1. Generate ONLY SELECT queries
2. Use proper JOINs and filters
3. Optimize for performance
4. Handle NULL values properly
5. Return ONLY the SQL, no explanations
6. Use proper table and column names from the schema

Schema Context:
"""

    async def generate_sql(
        self,
        query: str,
        schema_text: str,
        model: str = "kimi-k2-thinking-turbo"
    ) -> str:
        """生成SQL查询"""
        prompt = f"{self.system_prompt}\n\n{schema_text}\n\nUser Query: {query}\n\nSQL:"

        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=2000
            )

            sql = response.choices[0].message.content.strip()

            # 清理SQL（移除可能的Markdown标记）
            if sql.startswith("```sql"):
                sql = sql[6:]
            elif sql.startswith("```"):
                sql = sql[3:]

            if sql.endswith("```"):
                sql = sql[:-3]

            return sql.strip()

        except Exception as e:
            raise Exception(f"LLM API调用失败: {e}")

    async def validate_result(
        self,
        user_query: str,
        sql: str,
        result_preview: str,
        model: str = "kimi-k2-thinking-turbo"
    ) -> dict:
        """验证查询结果"""
        prompt = f"""
Validate if the SQL query results match the user's intent.

User Query: {user_query}
Generated SQL: {sql}
Result Preview: {result_preview}

Check:
1. Does the result match what the user asked for?
2. Are there any obvious data anomalies (NULLS, outliers)?
3. Is the data complete?

Provide:
- validation_score (0-100)
- issues_found (list)
- suggestions (list)

Respond in JSON format.
"""

        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1000
            )

            validation_text = response.choices[0].message.content

            # 提取JSON
            if "```json" in validation_text:
                start = validation_text.find("```json") + 7
                end = validation_text.find("```", start)
                json_str = validation_text[start:end]
            else:
                json_str = validation_text

            return json.loads(json_str.strip())

        except Exception as e:
            return {
                "validation_score": 0,
                "issues_found": [f"Validation failed: {e}"],
                "suggestions": []
            }
```

### 2.3 SQL 安全校验模块

```python
# security/validator.py
import sqlglot
from sqlglot import expressions

class SQLSecurityValidator:
    """SQL安全性校验器"""

    BLACKLIST_KEYWORDS = {
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE',
        'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'EXECUTE',
        'BEGIN', 'COMMIT', 'ROLLBACK', 'COPY'
    }

    def validate(self, sql: str) -> tuple[bool, str]:
        """
        验证SQL安全性

        Returns:
            tuple: (is_valid, message)
        """
        if not sql or not sql.strip():
            return False, "SQL不能为空"

        # 1. 黑名单关键词检查
        sql_upper = sql.upper()
        for keyword in self.BLACKLIST_KEYWORDS:
            if keyword in sql_upper:
                return False, f"包含禁止的关键字: {keyword}"

        try:
            # 2. SQLGlot解析验证
            parsed = sqlglot.parse_one(sql)

            # 3. 只允许SELECT语句
            if not isinstance(parsed, expressions.Select):
                return False, "只允许SELECT查询语句"

            # 4. 检查语句复杂度（最大子查询嵌套层数）
            if self._get_query_depth(parsed) > 3:
                return False, "查询嵌套层数过多"

            return True, "验证通过"

        except Exception as e:
            return False, f"SQL解析错误: {str(e)}"

    def _get_query_depth(self, node, depth: int = 0) -> int:
        """计算查询嵌套深度"""
        max_depth = depth

        for child in node.iter_expressions():
            if isinstance(child, expressions.Subquery):
                child_depth = self._get_query_depth(child.this, depth + 1)
                max_depth = max(max_depth, child_depth)
            else:
                child_depth = self._get_query_depth(child, depth)
                max_depth = max(max_depth, child_depth)

        return max_depth
```

### 2.4 查询执行模块

```python
# query/executor.py
import asyncpg
import time

class QueryExecutor:
    """SQL查询执行器"""

    def __init__(self, db_manager):
        self.db_manager = db_manager

    async def execute(
        self,
        db_id: str,
        sql: str,
        max_rows: int = 1000
    ) -> dict:
        """
        执行SQL查询

        Returns:
            dict: {
                "sql": str,
                "rows": list,
                "execution_time": float,
                "row_count": int,
                "columns": list
            }
        """
        pool = self.db_manager.get_pool(db_id)
        if not pool:
            raise ValueError(f"Database {db_id} not connected")

        # 添加LIMIT限制（如果还没有）
        if "LIMIT" not in sql.upper():
            sql = f"{sql} LIMIT {max_rows}"

        start_time = time.time()

        try:
            async with pool.acquire() as conn:
                # 只读事务
                async with conn.transaction(readonly=True):
                    # 执行查询
                    rows = await conn.fetch(sql)

                    execution_time = time.time() - start_time

                    # 转换为字典列表
                    result_rows = [dict(row) for row in rows]

                    # 获取列名
                    columns = list(result_rows[0].keys()) if result_rows else []

                    return {
                        "sql": sql,
                        "rows": result_rows,
                        "execution_time": execution_time,
                        "row_count": len(result_rows),
                        "columns": columns
                    }

        except asyncpg.Error as e:
            raise Exception(f"查询执行失败: {e}")

    async def test_connection(self, db_id: str) -> tuple[bool, str]:
        """测试数据库连接"""
        try:
            pool = self.db_manager.get_pool(db_id)
            if not pool:
                return False, "No connection pool"

            async with pool.acquire() as conn:
                await conn.fetch("SELECT 1")
                return True, "Connection OK"

        except Exception as e:
            return False, str(e)
```

## 3. MCP 接口设计

### 3.1 MCP Server 实现

```python
# mcp/server.py
from mcp.server import Server
from mcp.types import Tool, TextContent
import json

class PostgresMCPServer:
    """Postgres MCP Server"""

    def __init__(self, service):
        self.service = service
        self.server = Server("postgres-mcp")
        self._setup_handlers()

    def _setup_handlers(self):
        """设置MCP处理器"""

        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            """列出可用工具"""
            return [
                Tool(
                    name="query_database",
                    description="通过自然语言查询PostgreSQL数据库",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "自然语言查询，例如：查询最近10个订单"
                            },
                            "database": {
                                "type": "string",
                                "description": "数据库ID（如：production, analytics）"
                            },
                            "validate": {
                                "type": "boolean",
                                "description": "是否验证结果（默认false）",
                                "default": False
                            }
                        },
                        "required": ["query", "database"]
                    }
                ),
                Tool(
                    name="execute_sql",
                    description="直接执行SQL查询（仅限SELECT）",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "sql": {
                                "type": "string",
                                "description": "SQL查询语句"
                            },
                            "database": {
                                "type": "string",
                                "description": "数据库ID"
                            }
                        },
                        "required": ["sql", "database"]
                    }
                ),
                Tool(
                    name="list_databases",
                    description="列出所有可用的数据库",
                    inputSchema={
                        "type": "object",
                        "properties": {}
                    }
                ),
                Tool(
                    name="refresh_schema",
                    description="刷新指定数据库的schema缓存",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "database": {
                                "type": "string",
                                "description": "数据库ID"
                            }
                        },
                        "required": ["database"]
                    }
                )
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[TextContent]:
            """处理工具调用"""
            try:
                if name == "query_database":
                    result = await self.service.query_database(
                        query=arguments["query"],
                        db_id=arguments["database"],
                        validate_result=arguments.get("validate", False)
                    )

                elif name == "execute_sql":
                    result = await self.service.execute_sql(
                        sql=arguments["sql"],
                        db_id=arguments["database"]
                    )

                elif name == "list_databases":
                    result = await self.service.list_databases()

                elif name == "refresh_schema":
                    result = await self.service.refresh_schema(arguments["database"])

                else:
                    raise ValueError(f"Unknown tool: {name}")

                return [TextContent(
                    type="text",
                    text=json.dumps(result, indent=2, ensure_ascii=False, default=str)
                )]

            except Exception as e:
                return [TextContent(
                    type="text",
                    text=json.dumps({
                        "error": type(e).__name__,
                        "message": str(e)
                    }, indent=2, ensure_ascii=False)
                )]

    async def start(self):
        """启动MCP服务器"""
        from mcp.server.stdio import stdio_server

        async with stdio_server() as streams:
            await self.server.run(
                streams[0],
                streams[1],
                self.server.create_initialization_options()
            )
```

## 4. 配置管理

### 4.1 配置文件设计

```yaml
# config/config.yaml
databases:
  production:
    host: "localhost"
    port: 5432
    database: "mydb"
    user: "postgres"
    password: "${DB_PASSWORD}"  # 从环境变量读取

  analytics:
    host: "localhost"
    port: 5432
    database: "analytics"
    user: "postgres"
    password: "${DB_PASSWORD}"

llm:
  api_key: "${KIMI_API_KEY}"  # 从环境变量读取
  base_url: "https://api.moonshot.cn/v1"
  model: "kimi-k2-thinking-turbo"

query:
  max_rows: 1000
  timeout: 30
```

### 4.2 配置加载器

```python
# config/loader.py
import yaml
import os

class Config:
    """配置管理"""

    def __init__(self, config_path: str = "config/config.yaml"):
        self.config_path = config_path
        self._data = {}
        self.load()

    def load(self):
        """加载配置"""
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path, 'r') as f:
            self._data = yaml.safe_load(f)

        # 替换环境变量
        self._replace_env_vars(self._data)

    def _replace_env_vars(self, obj):
        """递归替换环境变量"""
        if isinstance(obj, dict):
            for key, value in obj.items():
                if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
                    env_var = value[2:-1]
                    obj[key] = os.environ.get(env_var, value)
                else:
                    self._replace_env_vars(value)
        elif isinstance(obj, list):
            for item in obj:
                self._replace_env_vars(item)

    def get(self, key: str, default=None):
        """获取配置值（支持点分隔符）"""
        keys = key.split('.')
        value = self._data

        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default

        return value

    def get_database(self, db_id: str) -> dict:
        """获取数据库配置"""
        return self.get(f"databases.{db_id}", {})

    def get_llm_config(self) -> dict:
        """获取LLM配置"""
        return self.get("llm", {})

    def get_query_config(self) -> dict:
        """获取查询配置"""
        return self.get("query", {})

    def list_databases(self) -> list[str]:
        """列出所有数据库ID"""
        return list(self.get("databases", {}).keys())
```

## 5. 服务层

```python
# service/query.py
import time
import json

class QueryService:
    """查询服务"""

    def __init__(self, config: Config):
        self.config = config
        self.db_manager = DatabaseManager()
        self.schema_manager = SchemaManager(self.db_manager)
        self.llm_service = None
        self.query_executor = QueryExecutor(self.db_manager)
        self._setup_services()

    def _setup_services(self):
        """初始化服务"""
        # 连接数据库
        for db_id in self.config.list_databases():
            db_config = self.config.get_database(db_id)
            if db_config:
                asyncio.create_task(self.db_manager.connect(db_id, db_config))

        # 初始化LLM服务
        llm_config = self.config.get_llm_config()
        if llm_config.get('api_key'):
            self.llm_service = LLMService(
                api_key=llm_config['api_key'],
                base_url=llm_config.get('base_url')
            )

    async def query_database(
        self,
        query: str,
        db_id: str,
        validate_result: bool = False
    ) -> dict:
        """通过自然语言查询数据库"""
        start_time = time.time()

        try:
            # 1. 获取Schema
            schema = await self.schema_manager.get_schema(db_id)
            schema_text = self.schema_manager.get_schema_text(db_id)

            # 2. 生成SQL
            if not self.llm_service:
                raise Exception("LLM service not initialized")

            sql = await self.llm_service.generate_sql(query, schema_text)

            # 3. 执行查询
            result = await self.query_executor.execute(
                db_id=db_id,
                sql=sql
            )

            # 4. 结果验证（可选）
            validation = None
            if validate_result:
                preview = json.dumps(result['rows'][:5], ensure_ascii=False)
                validation = await self.llm_service.validate_result(
                    user_query=query,
                    sql=sql,
                    result_preview=preview
                )

            return {
                "success": True,
                "query": query,
                "sql": sql,
                "results": result['rows'],
                "columns": result['columns'],
                "row_count": result['row_count'],
                "execution_time": time.time() - start_time,
                "validation": validation
            }

        except Exception as e:
            return {
                "success": False,
                "error": type(e).__name__,
                "message": str(e)
            }

    async def execute_sql(self, sql: str, db_id: str) -> dict:
        """直接执行SQL"""
        try:
            # 验证SQL
            from security.validator import SQLSecurityValidator
            validator = SQLSecurityValidator()
            is_valid, message = validator.validate(sql)

            if not is_valid:
                return {"success": False, "error": "SecurityError", "message": message}

            # 执行查询
            result = await self.query_executor.execute(db_id=db_id, sql=sql)

            return {
                "success": True,
                "sql": sql,
                "results": result['rows'],
                "columns": result['columns'],
                "row_count": result['row_count'],
                "execution_time": result['execution_time']
            }

        except Exception as e:
            return {
                "success": False,
                "error": type(e).__name__,
                "message": str(e)
            }

    async def list_databases(self) -> dict:
        """列出所有数据库"""
        databases = []

        for db_id in self.config.list_databases():
            # 测试连接
            is_connected, message = await self.query_executor.test_connection(db_id)
            databases.append({
                "id": db_id,
                "connected": is_connected,
                "status": message
            })

        return {
            "success": True,
            "databases": databases
        }

    async def refresh_schema(self, db_id: str) -> dict:
        """刷新Schema缓存"""
        try:
            schema = await self.schema_manager.refresh_schema(db_id)
            table_count = len(schema.get('tables', {}))

            return {
                "success": True,
                "message": f"Schema refreshed, {table_count} tables found"
            }

        except Exception as e:
            return {
                "success": False,
                "error": type(e).__name__,
                "message": str(e)
            }
```

## 6. 启动脚本

```python
# main.py
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from config.loader import Config
from mcp.server import PostgresMCPServer
from service.query import QueryService

async def main():
    """主函数"""
    # 加载配置
    config = Config()
    print("Configuration loaded")

    # 初始化服务
    service = QueryService(config)

    # 测试数据库连接
    print("\nTesting database connections...")
    db_list = await service.list_databases()
    for db in db_list['databases']:
        status = "✓" if db['connected'] else "✗"
        print(f"  {status} {db['id']}: {db['status']}")

    # 启动MCP服务器
    print("\nStarting MCP server...")
    mcp_server = PostgresMCPServer(service)
    await mcp_server.start()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down...")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
```

## 7. 项目结构

```
pg-mcp/
├── config/
│   └── config.yaml          # 配置文件
├── database/
│   ├── __init__.py
│   ├── manager.py          # 数据库连接管理
│   └── schema.py           # Schema管理
├── llm/
│   ├── __init__.py
│   └── service.py          # LLM服务
├── security/
│   ├── __init__.py
│   └── validator.py        # SQL验证
├── query/
│   ├── __init__.py
│   └── executor.py         # 查询执行
├── mcp/
│   ├── __init__.py
│   └── server.py           # MCP服务器
├── config/
│   ├── __init__.py
│   └── loader.py           # 配置加载
├── service/
│   ├── __init__.py
│   └── query.py            # 查询服务
├── main.py                 # 启动脚本
└── requirements.txt        # 依赖文件
```

## 8. 依赖文件

```txt
# requirements.txt
mcp>=0.1.0
asyncpg>=0.29.0
sqlglot>=20.0.0
openai>=1.0.0
pyyaml>=6.0
```

## 9. 使用示例

### 9.1 配置文件

```yaml
# config/config.yaml
databases:
  mydb:
    host: "localhost"
    port: 5432
    database: "mydatabase"
    user: "postgres"
    password: "${DB_PASSWORD}"

llm:
  api_key: "${KIMI_API_KEY}"
```

### 9.2 启动服务

```bash
# 设置环境变量
export KIMI_API_KEY="your-api-key"
export DB_PASSWORD="your-db-password"

# 启动服务
python main.py
```

### 9.3 使用MCP客户端

```python
from mcp import Client

# 连接MCP服务器
client = Client()
await client.connect("stdio://")

# 查询数据库
tools = await client.list_tools()
result = await client.call_tool("query_database", {
    "query": "查询最近10个订单",
    "database": "mydb"
})

print(result)
```

---

**文档信息**
- **版本**: v1.0 (Simplified)
- **创建日期**: 2026-01-12
- **创建人**: AI Coding Bootcamp
- **审核状态**: 待审核
- **关联文档**: [PRD](./0001-pg-mcp-prd.md)
