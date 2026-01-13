# CLAUDE.md - pg-mcp Implementation Guide

## Project Overview

pg-mcp is a PostgreSQL MCP (Model Context Protocol) Server that enables natural language querying of PostgreSQL databases using AI-powered SQL generation. The project implements a clean, async architecture with robust security and comprehensive testing.

## Python Best Practices & Code Quality Standards

### 1. Code Organization & Structure

#### Follow the Repository Pattern
- Separate business logic from data access
- Use dependency injection for testability
- Keep modules focused on single responsibilities

```python
# ✅ GOOD: Repository Pattern
class DatabaseRepository:
    """Handles all database operations"""

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    async def fetch_all(self, query: str) -> list[dict]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query)
            return [dict(row) for row in rows]

# ❌ AVOID: Mixed responsibilities
class MixedService:
    def __init__(self):  # Hard to test - creates dependencies internally
        self.pool = asyncpg.create_pool(...)  # Bad - hidden dependency
```

#### Type Hints Everywhere
- Use type hints for all functions and class members
- Use `typing.Optional` for nullable values
- Use `typing.Protocol` for interfaces
- Use generics for collections

```python
# ✅ GOOD: Comprehensive type hints
from typing import Optional, TypeVar, Protocol, List, Dict, Any

T = TypeVar('T')

DatabaseConfig = Dict[str, Any]

class QueryExecutor(Protocol):
    async def execute(self, sql: str) -> List[DatabaseRow]: ...

class DatabaseRepository:
    def __init__(self, config: DatabaseConfig) -> None:
        self._pool: Optional[asyncpg.Pool] = None
        self._config: DatabaseConfig = config

    async def fetch_all(self, query: str, params: Optional[list] = None) -> List[dict]:
        ...

# ❌ AVOID: Missing type hints
def process(data):  # What's data? What's returned?
    return do_something(data)  # Unknown types
```

#### Use Value Objects & DTOs
- Encapsulate related data in dataclasses or Pydantic models
- Immutable objects where possible
- Clear separation of concerns

```python
# ✅ GOOD: Value objects with Pydantic
from pydantic import BaseModel, Field
from typing import Literal

class ColumnSchema(BaseModel):
    name: str
    data_type: str
    nullable: bool = False
    is_primary: bool = False

class TableSchema(BaseModel):
    name: str
    schema: Literal["public", "private"]
    columns: list[ColumnSchema]

# ❌ AVOID: Raw dictionaries
def get_table_schema() -> dict:  # What's in this dict?
    return {
        "name": "users",
        "columns": [...],  # What format?
    }
```

### 2. SOLID Principles Implementation

#### Single Responsibility Principle (SRP)
Each class/module should have only one reason to change.

```python
# ✅ GOOD: Single responsibility per class
class SchemaManager:
    """Only responsible for schema management"""

    async def discover_schema(self, db_id: str) -> DatabaseSchema: ...
    async def refresh_schema(self, db_id: str) -> DatabaseSchema: ...
    def get_schema_text(self, db_id: str) -> str: ...

class QueryExecutor:
    """Only responsible for query execution"""

    async def execute(self, sql: str) -> QueryResult: ...

# ❌ AVOID: Multiple responsibilities
class GodService:  # Does everything - hard to maintain
    def manage_schema(self): ...
    def execute_queries(self): ...
    def handle_logging(self): ...
    def manage_connections(self): ...
```

#### Open/Closed Principle (OCP)
Open for extension, closed for modification.

```python
# ✅ GOOD: Extensible through protocols
from typing import Protocol

class SQLGenerator(Protocol):
    async def generate(self, query: str) -> str: ...

class KimiSQLGenerator:
    def __init__(self, api_key: str): ...
    async def generate(self, query: str) -> str: ...

class MockSQLGenerator:
    """For testing without API calls"""
    async def generate(self, query: str) -> str:
        return "SELECT 1;"

class QueryService:
    def __init__(self, generator: SQLGenerator):  # Accept any generator
        self._generator = generator

# Can extend without modifying QueryService
class AdvancedSQLGenerator(SQLGenerator):
    async def generate(self, query: str) -> str: ...
```

#### Liskov Substitution Principle (LSP)
Subtypes must be substitutable for their base types.

```python
# ✅ GOOD: Proper inheritance
class DatabaseError(Exception):
    """Base database error"""
    code: str
    message: str
    details: Optional[dict] = None

class ConnectionError(DatabaseError):
    """Specific connection error"""
    code = "CONN_ERROR"

class QueryError(DatabaseError):
    """Specific query error"""
    code = "QUERY_ERROR"

# Can handle any DatabaseError
async def handle_error(error: DatabaseError) -> ErrorResponse:
    return ErrorResponse(code=error.code, message=error.message)
```

#### Interface Segregation Principle (ISP)
Clients shouldn't be forced to depend on interfaces they don't use.

```python
# ✅ GOOD: Specific interfaces
class ConnectionManager(Protocol):
    async def connect(self) -> bool: ...
    async def disconnect(self) -> None: ...

class QueryExecutor(Protocol):
    async def execute(self, sql: str) -> QueryResult: ...
    async def fetch_all(self, sql: str) -> list[dict]: ...

class SchemaManager(Protocol):
    async def get_schema(self, db_id: str) -> DatabaseSchema: ...
    async def refresh_schema(self, db_id: str) -> DatabaseSchema: ...

# ❌ AVOID: God interface
class DatabaseInterface(Protocol):
    # Too many responsibilities
    def connect(self): ...
    def execute(self): ...
    def get_schema(self): ...
    def manage_pools(self): ...
    def log_metrics(self): ...
```

#### Dependency Inversion Principle (DIP)
Depend on abstractions, not concretions.

```python
# ✅ GOOD: DIP implementation
from abc import ABC, abstractmethod

class LLMProvider(ABC):
    @abstractmethod
    async def generate_sql(self, prompt: str) -> str: ...

class KimiProvider(LLMProvider):
    """Kimi LLM implementation"""
    async def generate_sql(self, prompt: str) -> str: ...

class MockProvider(LLMProvider):
    """Mock for testing"""
    async def generate_sql(self, prompt: str) -> str: ...

class QueryService:
    def __init__(self, llm: LLMProvider):  # Depends on abstraction
        self._llm = llm

# Usage
service = QueryService(llm=KimiProvider(api_key="..."))
# Easily testable
service = QueryService(llm=MockProvider())
```

### 3. DRY (Don't Repeat Yourself) & Code Reuse

#### Extract Common Patterns
```python
# ✅ GOOD: Reusable context managers
from contextlib import asynccontextmanager

@asynccontextmanager
async def database_transaction(pool: asyncpg.Pool, readonly: bool = True):
    """Reusable transaction context"""
    async with pool.acquire() as conn:
        async with conn.transaction(readonly=readonly):
            yield conn

# Usage
async def fetch_users(pool: asyncpg.Pool) -> list[dict]:
    async with database_transaction(pool) as conn:
        return await conn.fetch("SELECT * FROM users")

async def fetch_orders(pool: asyncpg.Pool) -> list[dict]:
    async with database_transaction(pool) as conn:
        return await conn.fetch("SELECT * FROM orders")

# ❌ AVOID: Repeated transaction code
async def fetch_users(pool: asyncpg.Pool) -> list[dict]:
    async with pool.acquire() as conn:  # Repeated
        async with conn.transaction(readonly=True):  # Repeated
            return await conn.fetch("SELECT * FROM users")
```

#### Utility Functions for Common Operations
```python
# ✅ GOOD: Utility functions
import re

def sanitize_sql(sql: str) -> str:
    """Remove markdown code blocks from SQL"""
    sql = re.sub(r'^```sql\n?', '', sql)
    sql = re.sub(r'^```\n?', '', sql)
    sql = re.sub(r'\n?```$', '', sql)
    return sql.strip()

def limit_query(sql: str, max_rows: int) -> str:
    """Safely add LIMIT to query"""
    if re.search(r'LIMIT\s+\d+', sql, re.IGNORECASE):
        return sql
    return f"{sql}\nLIMIT {max_rows}"

# ❌ AVOID: Inline repeated logic
sql = response.choices[0].message.content  # Where's the sanitization?
```

### 4. Error Handling Best Practices

#### Custom Exception Hierarchy
```python
# ✅ GOOD: Meaningful exception hierarchy
class PostgresMCPError(Exception):
    """Base exception for postgres-mcp"""
    def __init__(self, message: str, details: Optional[dict] = None):
        self.message = message
        self.details = details
        super().__init__(self.message)

class DatabaseError(PostgresMCPError):
    """Database-related errors"""
    code = "DB_ERROR"

class SecurityError(PostgresMCPError):
    """Security validation errors"""
    code = "SECURITY_ERROR"

class LLMError(PostgresMCPError):
    """LLM service errors"""
    code = "LLM_ERROR"

# Usage with context
async def execute_query(...):
    try:
        pool = self._manager.get_pool(db_id)
        if not pool:
            raise DatabaseError(f"Database {db_id} not connected")
    except asyncpg.Error as e:
        raise DatabaseError(f"Query failed: {e}", details={"sqlstate": e.sqlstate})
```

#### Result Pattern Instead of Exceptions for User Errors
```python
# ✅ GOOD: Result pattern for validation
from dataclasses import dataclass
from typing import Generic, TypeVar, Union

T = TypeVar('T')
E = TypeVar('E')

@dataclass
class Ok(Generic[T]):
    value: T

@dataclass
class Err(Generic[E]):
    error: E

Result = Union[Ok[T], Err[E]]

class ValidationResult:
    @staticmethod
    def ok() -> Result[None, str]:
        return Ok(None)

    @staticmethod
    def err(message: str) -> Result[None, str]:
        return Err(message)

# Usage
def validate_sql(sql: str) -> Result[None, str]:
    if "DROP TABLE" in sql.upper():
        return ValidationResult.err("DROP statements not allowed")
    return ValidationResult.ok()

# Handle result
result = validate_sql(user_sql)
if isinstance(result, Err):
    return {"error": result.error}
```

### 5. Async/Await Best Practices

#### Always Use Async Context Managers
```python
# ✅ GOOD: Proper async context managers
async def fetch_data(pool: asyncpg.Pool) -> list[dict]:
    async with pool.acquire() as conn:  # Releases connection automatically
        async with conn.transaction():   # Commits/rolls back automatically
            return await conn.fetch("SELECT * FROM data")

# ❌ AVOID: Manual resource management
async def fetch_data(pool: asyncpg.Pool) -> list[dict]:
    conn = await pool.acquire()  # Might leak connection
    try:
        return await conn.fetch("SELECT * FROM data")
    finally:
        await pool.release(conn)   # Boilerplate
```

#### Handle Timeouts Properly
```python
# ✅ GOOD: Timeout handling
import asyncio

async def execute_with_timeout(
    coro: Coroutine,
    timeout: float = 30.0
) -> Any:
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        raise QueryError(f"Query timed out after {timeout} seconds")

# Usage
result = await execute_with_timeout(
    conn.fetch("SELECT * FROM large_table"),
    timeout=30.0
)
```

#### Avoid Blocking Operations in Async Code
```python
# ✅ GOOD: Use async libraries
import aiofiles

async def read_config(path: str) -> dict:
    async with aiofiles.open(path, 'r') as f:
        content = await f.read()
        return yaml.safe_load(content)

# ❌ AVOID: Blocking I/O
import time
def blocking_operation():
    time.sleep(5)  # Blocks entire event loop!
```

## Testing Standards

### 1. Test Pyramid
- **Unit Tests**: 70% - Test individual components in isolation
- **Integration Tests**: 20% - Test component interactions
- **End-to-End Tests**: 10% - Test complete flows

### 2. Unit Testing Best Practices

#### Test Naming Convention
```python
# ✅ GOOD: Descriptive test names
def test_sql_validator_rejects_drop_table():
    """Test that DROP TABLE statements are rejected"""
    ...

def test_query_executor_returns_rows_in_correct_format():
    """Test that query executor returns properly formatted rows"""
    ...

# ❌ AVOID: Vague names
def test_validator():
    ...

def test_executor():
    ...
```

#### Arrange-Act-Assert Pattern
```python
# ✅ GOOD: AAA pattern
def test_query_executor_timeout():
    # Arrange
    executor = QueryExecutor(pool=mock_pool)
    long_query = "SELECT * FROM huge_table"

    # Act
    with pytest.raises(QueryError) as exc_info:
        await executor.execute(long_query, timeout=0.1)

    # Assert
    assert "timed out" in str(exc_info.value)
    assert exc_info.value.code == "TIMEOUT_ERROR"
```

#### Use Test Fixtures and Factories
```python
# ✅ GOOD: Reusable fixtures
import pytest

@pytest.fixture
def mock_pool():
    """Create mock connection pool"""
    pool = AsyncMock()
    pool.acquire = AsyncMock()
    return pool

@pytest.fixture
def sample_schema():
    """Sample schema for testing"""
    return DatabaseSchema(
        tables={
            "users": TableSchema(
                name="users",
                columns=[
                    ColumnSchema(name="id", data_type="integer"),
                    ColumnSchema(name="name", data_type="varchar"),
                ]
            )
        }
    )

def test_with_fixtures(mock_pool, sample_schema):
    """Test uses fixtures"""
    manager = SchemaManager(mock_pool)
    # ...
```

#### Mock External Dependencies
```python
# ✅ GOOD: Proper mocking
@pytest.mark.asyncio
async def test_llm_generation_success():
    """Test successful LLM SQL generation"""
    # Arrange
    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        return_value=Mock(
            choices=[Mock(message=Mock(content="SELECT * FROM users"))]
        )
    )

    service = LLMService(api_key="test-key")
    service._client = mock_client

    # Act
    result = await service.generate_sql("get all users", schema)

    # Assert
    assert result == "SELECT * FROM users"
    mock_client.chat.completions.create.assert_called_once()
```

### 3. Integration Testing

#### Test Real Database Interactions
```python
# ✅ GOOD: Use testcontainers
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
async def postgres():
    """Real postgres for integration tests"""
    container = PostgresContainer("postgres:15")
    container.start()

    conn_str = container.get_connection_url()
    pool = await asyncpg.create_pool(conn_str)

    # Setup test data
    await setup_test_data(pool)

    yield pool

    await pool.close()
    container.stop()

@pytest.mark.integration
async def test_end_to_end_query(postgres):
    """Real database integration test"""
    service = QueryService(pool=postgres)
    result = await service.execute("SELECT * FROM test_users")
    assert len(result.rows) == 3
```

#### Test Error Scenarios
```python
# ✅ GOOD: Test error paths
@pytest.mark.asyncio
async def test_query_fails_with_invalid_sql():
    """Test proper error handling"""
    service = QueryService(pool=valid_pool)

    with pytest.raises(SecurityError) as exc:
        await service.execute("DROP TABLE users")

    assert exc.value.code == "SECURITY_ERROR"
    assert "DROP statements" in exc.value.message
```

### 4. Test Quality Metrics

#### Target Metrics
- **Code Coverage**: > 85%
- **Branch Coverage**: > 80%
- **Mutation Score**: > 70%
- **Test Execution Time**: < 30 seconds total

#### Use pytest markers
```python
# ✅ GOOD: Use pytest markers
import pytest

@pytest.mark.unit
def test_sql_validator():
    """Fast unit test"""
    ...

@pytest.mark.integration
async def test_database_integration():
    """Integration test"""
    ...

@pytest.mark.slow
async def test_performance_benchmark():
    """Slow performance test"""
    ...

# Run with: pytest -m "not slow"  # Skip slow tests
```

## Code Quality Enforcement

### 1. Static Analysis Tools

#### Required Tools
```bash
# Add to requirements-dev.txt
ruff==0.6.0          # Linting and formatting
mypy==1.11.0         # Type checking
bandit==1.7.8        # Security issues
pre-commit==3.8.0    # Git hooks

# pre-commit hooks
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.0
    hooks:
      - id: ruff
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.11.0
    hooks:
      - id: mypy
        additional_dependencies: [types-PyYAML, asyncpg-stubs]
```

#### Configuration (pyproject.toml)
```toml
[tool.ruff]
line-length = 100
target-version = "py310"
select = [
    "E",  # pycodestyle errors
    "W",  # pycodestyle warnings
    "F",  # pyflakes
    "I",  # isort
    "B",  # flake8-bugbear
    "C4", # flake8-comprehensions
    "UP", # pyupgrade
    "PL", # pylint
]
ignore = ["PLR2004", "PLR0913"]  # Magic values, too many args are OK

[tool.mypy]
python_version = "3.10"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
check_untyped_defs = true
```

### 2. Documentation Standards

#### Docstrings for all functions
```python
# ✅ GOOD: Comprehensive docstrings
async def generate_sql(
    self,
    query: str,
    schema: DatabaseSchema,
    temperature: float = 0.1
) -> str:
    """Generate SQL from natural language query using LLM.

    Args:
        query: Natural language query (e.g., "get all active users")
        schema: Database schema information for context
        temperature: LLM creativity (0.0-2.0, lower is more deterministic)

    Returns:
        Valid SQL query string

    Raises:
        LLMError: If LLM API call fails
        ValidationError: If generated SQL is invalid

    Example:
        >>> sql = await llm.generate_sql(
        ...     "find users from New York",
        ...     schema
        ... )
        >>> assert "WHERE city = 'New York'" in sql
    """
```

#### README.md with examples
```markdown
## Quick Start

```python
from pg_mcp import QueryService, Config

# Load configuration
config = Config("config.yaml")
service = QueryService(config)

# Execute natural language query
result = await service.query("get top 10 users by score")
print(f"SQL: {result.sql}")
print(f"Rows: {len(result.rows)}")
```

## Architecture
[Diagram with components and data flow]
```

## Implementation Task List

Based on the design document, here are the precise implementation tasks:

### Phase 1: Foundation (Setup)
- [ ] Create project structure with proper package layout
- [ ] Set up `pyproject.toml` with all dependencies
- [ ] Configure pre-commit hooks (ruff, mypy, bandit)
- [ ] Create `config/config.yaml` template
- [ ] Set up pytest configuration and test structure
- [ ] Create initial README.md with setup instructions

### Phase 2: Database Layer
- [ ] Implement `DatabaseManager` with asyncpg pool management
- [ ] Implement `SchemaManager` with schema discovery
- [ ] Add schema caching logic
- [ ] Write unit tests for DatabaseManager
- [ ] Write unit tests for SchemaManager
- [ ] Write integration test for schema discovery

### Phase 3: Security Layer
- [ ] Implement `SQLSecurityValidator` with SQLGlot
- [ ] Add blacklist validation
- [ ] Add query depth checking
- [ ] Write comprehensive tests for all validation rules
- [ ] Performance test validator (should handle complex queries < 100ms)

### Phase 4: LLM Integration
- [ ] Implement `LLMService` with Kimi API
- [ ] Build prompt engineering utilities
- [ ] Implement SQL extraction from LLM responses
- [ ] Add result validation logic
- [ ] Mock LLM calls for tests
- [ ] Write tests for prompt building
- [ ] Write integration tests for SQL generation

### Phase 5: Query Execution
- [ ] Implement `QueryExecutor` with transaction management
- [ ] Add LIMIT injection
- [ ] Implement result formatting
- [ ] Add timeout handling
- [ ] Write tests for query execution
- [ ] Write tests for error scenarios

### Phase 6: MCP Server
- [ ] Implement MCP server with all tools
- [ ] Add connection management
- [ ] Implement error handling for MCP layer
- [ ] Write integration tests for MCP protocol
- [ ] Test with Claude Desktop

### Phase 7: Service Layer
- [ ] Implement `QueryService` orchestrating all components
- [ ] Add input validation
- [ ] Implement result formatting
- [ ] Add metrics collection (optional)
- [ ] Write end-to-end integration tests

### Phase 8: Testing & Quality
- [ ] Achieve 85%+ code coverage
- [ ] Add property-based tests for validators
- [ ] Performance benchmark tests
- [ ] Security test suite
- [ ] Run mutation testing
- [ ] Fix all type hints
- [ ] Resolve all linting issues

### Phase 9: Documentation
- [ ] Complete README.md with all examples
- [ ] Add API documentation
- [ ] Create usage guide
- [ ] Add troubleshooting section

## Success Criteria

Before considering implementation complete:

1. **Functionality** (must have)
   - All 4 MCP tools working (query_database, execute_sql, list_databases, refresh_schema)
   - SQL generation success rate > 95%
   - Security: 100% of non-SELECT queries rejected
   - All tests passing

2. **Code Quality** (must have)
   - 85%+ test coverage
   - Zero mypy errors
   - Zero ruff violations
   - All functions have docstrings

3. **Architecture** (should have)
   - All SOLID principles followed
   - No code duplication
   - Proper separation of concerns
   - Comprehensive error handling

4. **Documentation** (should have)
   - Complete README
   - API documentation
   - Example queries for each database

## Running the Tests

```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Run linting
ruff check .

# Run type checking
mypy .

# Run tests
pytest tests/

# Run with coverage
pytest --cov=pg_mcp --cov-report=html tests/

# Run specific test categories
pytest -m unit          # Unit tests only
pytest -m integration   # Integration tests only
pytest -m "not slow"    # Exclude slow tests
```

## Deployment

### Local Development
```bash
# 1. Clone and setup
git clone <repo>
cd pg-mcp
python -m pip install -e .

# 2. Configure
cp config/config.example.yaml config/config.yaml
# Edit config.yaml with your settings

# 3. Set environment variables
export KIMI_API_KEY="your-key"
export DB_PASSWORD="your-password"

# 4. Run
python main.py
```

### Claude Desktop Integration
```yaml
# claude_desktop_config.json
{mcp}
  "mcpServers": {
    "postgres": {
      "command": "python",
      "args": ["/path/to/pg-mcp/main.py"]
    }
  }
}
```

---

**Document Version**: 1.0
**Last Updated**: 2026-01-12
**Maintainer**: AI Coding Bootcamp
**Status**: Implementation Guide
