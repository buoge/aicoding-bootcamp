# 数据库查询系统架构设计

## 设计理念

本架构遵循 SOLID 设计原则，提供高度可扩展和可维护的数据库查询系统。

## 核心组件

### 1. DatabaseAdapter (数据库适配器接口)

位于 `app/db/adapters/base.py` - 定义所有数据库操作的标准接口

```python
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

from app.models.connection import TableInfo, QueryResult


class IDatabaseAdapter(ABC):
    """数据库适配器接口 - 定义所有数据库必须实现的操作"""

    @abstractmethod
    def get_metadata(self) -> List[TableInfo]:
        """获取数据库元数据 (表、列、视图)"""
        pass

    @abstractmethod
    def execute_query(self, sql: str, **kwargs) -> QueryResult:
        """执行 SQL 查询"""
        pass

    @abstractmethod
    def validate_sql(self, sql: str) -> bool:
        """验证 SQL 语法和安全性"""
        pass

    @abstractmethod
    def test_connection(self) -> bool:
        """测试连接是否正常"""
        pass

    @property
    @abstractmethod
    def dialect(self) -> str:
        """返回数据库方言"""
        pass
```

### 2. 具体数据库适配器

每个数据库类型有独立的适配器实现，位于 `app/db/adapters/` 目录：

- `postgresql_adapter.py`: PostgreSQL 实现
- `mysql_adapter.py`: MySQL 实现
- `sqlite_adapter.py`: SQLite 实现
- `mssql_adapter.py`: SQL Server 实现

每个适配器继承 `IDatabaseAdapter` 并实现具体的数据库操作。

### 3. AdapterFactory (适配器工厂)

位于 `app/db/adapters/factory.py` - 负责创建正确的适配器实例

```python
from app.db.adapters.base import IDatabaseAdapter
from app.db.adapters.postgresql_adapter import PostgreSQLAdapter
from app.db.adapters.mysql_adapter import MySQLAdapter


class AdapterFactory:
    """工厂类，根据连接 URL 创建正确的数据库适配器"""

    _adapters = {
        'postgresql': PostgreSQLAdapter,
        'mysql': MySQLAdapter,
        # ... 其他适配器注册
    }

    @classmethod
    def create(cls, connection_url: str) -> IDatabaseAdapter:
        """根据连接 URL 创建适配器实例"""
        # 解析 URL 前缀
        adapter_type = cls._detect_adapter_type(connection_url)
        adapter_class = cls._adapters.get(adapter_type)
        if not adapter_class:
            raise ValueError(f"Unsupported database type: {adapter_type}")
        return adapter_class(connection_url)

    @classmethod
    def _detect_adapter_type(cls, url: str) -> str:
        """从 URL 中检测数据库类型"""
        # 实现 URL 解析逻辑
        pass
```

### 4. ConnectionManager (连接管理器)

位于 `app/db/manager.py` - 管理数据库连接和连接池

```python
class ConnectionManager:
    """连接管理器 - 管理所有数据库连接"""

    def __init__(self):
        self._engines: Dict[str, Engine] = {}
        self._pools: Dict[str, Any] = {}

    def get_engine(self, connection_url: str) -> Engine:
        """获取或创建 SQLAlchemy Engine"""
        if connection_url not in self._engines:
            self._engines[connection_url] = create_engine(connection_url, ...)
        return self._engines[connection_url]

    def close_all(self):
        """关闭所有连接"""
        for engine in self._engines.values():
            engine.dispose()
```

## 架构优势

### 1. 开闭原则的实现

**添加新数据库支持**：

```python
# 1. 创建新适配器（无需修改现有代码）
# app/db/adapters/oracle_adapter.py
class OracleAdapter(IDatabaseAdapter):
    def get_metadata(self) -> List[TableInfo]:
        # Oracle 特有实现
        query = """
            SELECT table_name, column_name, data_type
            FROM user_tab_columns
            ORDER BY table_name, column_id
        """
        # ... 实现

    # 实现其他方法...

# 2. 注册到工厂（扩展而非修改）
# app/db/adapters/factory.py
class AdapterFactory:
    _adapters = {
        'postgresql': PostgreSQLAdapter,
        'mysql': MySQLAdapter,
        'oracle': OracleAdapter,  # 新增一行即可
    }
```

### 2. 依赖倒置的实现

**高层服务不再依赖具体数据库**:

```python
# 修改前:
# app/services/metadata_service.py
def fetch_postgres_metadata(connection_url):  # 硬编码 PostgreSQL
    # PostgreSQL 特有 SQL
    pass

# 修改后:
def fetch_metadata(adapter: IDatabaseAdapter):  # 依赖抽象
    return adapter.get_metadata()  # 不关心具体数据库
```

### 3. SOLID 原则的完整应用

#### 单一职责 (SRP)

```python
# Repository 模式 - 只负责数据持久化
class ConnectionRepository:
    def create(self, connection: Connection) -> int:
        """只负责保存连接信息"""
        pass

    def get(self, id: int) -> Connection:
        """只负责查询连接信息"""
        pass
```

```python
# Service 只负责业务逻辑
class MetadataSyncService:
    def __init__(self, adapter_factory: AdapterFactory):
        self.adapter_factory = adapter_factory

    def sync_metadata(self, connection) -> List[TableInfo]:
        """只负责同步逻辑"""
        adapter = self.adapter_factory.create(connection.url)
        return adapter.get_metadata()
```

#### 接口隔离 (ISP)

```python
# 分离不同能力的接口
class IQueryable(ABC):
    @abstractmethod
    def execute_query(self, sql: str) -> QueryResult:
        pass


class IMetadaStore(ABC):
    @abstractmethod
    def get_metadata(self) -> List[TableInfo]:
        pass


# 可以单独实现
def metadata_only_function(store: IMetadaStore):
    # 只依赖需要的接口
    pass


def query_only_function(query: IQueryable):
    # 只依赖需要的接口
    pass
```

#### 里氏替换 (LSP)

```python
# 任何适配器都可以替换使用
def process_database(adapter: IDatabaseAdapter):
    metadata = adapter.get_metadata()
    result = adapter.execute_query("SELECT 1")
    return metadata, result


# 所有具体实现都可以传入
postgres = PostgreSQLAdapter("postgresql://...")
mysql = MySQLAdapter("mysql://...")
sqlite = SQLiteAdapter("sqlite:///...")

# 都能正常工作
for adapter in [postgres, mysql, sqlite]:
    process_database(adapter)  # 无需修改代码
```

## 目录结构

```
app/
├── db/
│   ├── adapters/              # 数据库适配器
│   │   ├── __init__.py
│   │   ├── base.py           # 抽象接口 IDatabaseAdapter
│   │   ├── factory.py        # AdapterFactory
│   │   ├── postgresql_adapter.py
│   │   ├── mysql_adapter.py
│   │   └── sqlite_adapter.py
│   ├── manager.py            # ConnectionManager
│   ├── session.py            # 当前实现（可以重构）
│   └── metadata_store.py     # 当前实现（可以保留）
├── services/
│   ├── metadata_service.py   # 重构为依赖适配器接口
│   ├── query_service.py      # 重构为依赖适配器接口
│   └── nl2sql_service.py     # 重构为依赖适配器接口
└── core/
    └── config.py             # 配置管理

└──
```

## 迁移路径

### 阶段 1: 引入抽象接口

1. 创建 `IDatabaseAdapter` 接口
2. 创建 `AdapterFactory`
3. 创建 `ConnectionManager`

### 阶段 2: 实现现有适配器

1. 将 `metadata_service.py` 中的 `fetch_postgres_metadata` 提取为 `PostgreSQLAdapter`
2. 重构 `query_service.py` 使用适配器接口
3. 更新所有服务使用 `AdapterFactory` 创建适配器

### 阶段 3: 添加新数据库

1. 创建新的适配器实现（如 `MySQLAdapter`）
2. 在 `AdapterFactory` 中注册
3. 无需修改任何现有服务代码

## 测试策略

### 单元测试

```python
# 可以轻松 mock 适配器
class MockAdapter(IDatabaseAdapter):
    def get_metadata(self):
        return [TableInfo(...)]

# 测试服务逻辑而不需要真实数据库
def test_metadata_sync():
    service = MetadataSyncService()
    adapter = MockAdapter()
    result = service.sync_metadata(adapter)
    assert len(result) == 1
```

### 集成测试

```python
# 测试真实适配器
@pytest.mark.parametrize("adapter", [
    PostgreSQLAdapter("..."),
    MySQLAdapter("..."),
])
def test_adapter_compatibility(adapter: IDatabaseAdapter):
    metadata = adapter.get_metadata()
    result = adapter.execute_query("SELECT 1")
    assert result is not None
```

## 性能优化

### 连接池管理

```python
# ConnectionManager 管理连接池
class ConnectionManager:
    def __init__(self, pool_size=10):
        self._engines = {}
        self._pool_config = {
            'pool_size': pool_size,
            'max_overflow': 20,
            'pool_timeout': 30,
            'pool_recycle': 3600,
        }

    def get_engine(self, connection_url: str) -> Engine:
        if connection_url not in self._engines:
            self._engines[connection_url] = create_engine(
                connection_url, **self._pool_config
            )
        return self._engines[connection_url]
```

### SQL 缓存

```python
class DatabaseAdapter(IDatabaseAdapter):
    def __init__(self, connection_url: str):
        self.connection_url = connection_url
        self._metadata_cache = None
        self._query_cache = LRUCache(max_size=1000)

    def get_metadata(self) -> List[TableInfo]:
        if self._metadata_cache is None:
            self._metadata_cache = self._fetch_metadata()
        return self._metadata_cache

    def execute_query(self, sql: str) -> QueryResult:
        if sql in self._query_cache:
            return self._query_cache[sql]
        result = self._execute(sql)
        self._query_cache[sql] = result
        return result
```

## 总结

本架构通过以下方式解决了原始问题：

1. ✓ **开闭原则**: 添加新数据库只需要创建新适配器，不需要修改现有代码
2. ✓ **SOLID 原则**: 完整应用所有五个原则
3. ✓ **代码可维护性**: 清晰的职责分离，易于测试和扩展
4. ✓ **性能优化**: 连接池管理和缓存策略
5. ✓ **可测试性**: 依赖注入使得单元测试变得简单
