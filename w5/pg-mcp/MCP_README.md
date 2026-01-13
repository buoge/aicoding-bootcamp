# pg-mcp MCP Server

This is the MCP (Model Context Protocol) Server implementation for pg-mcp, which enables Claude Desktop and other MCP clients to interact with PostgreSQL databases using natural language queries.

## Overview

The PostgresMCP Server provides four main tools:

1. **query_database** - Convert natural language to SQL and execute
2. **execute_sql** - Execute validated SQL queries
3. **list_databases** - List configured databases and their status
4. **refresh_schema** - Refresh database schema cache

## Installation

### Prerequisites

- Python 3.10+
- PostgreSQL database access
- Kimi API key (for natural language to SQL conversion)

### Setup

1. Install the package:
```bash
pip install -e .
```

2. Configure your database connections in `config/config.yaml`:
```yaml
databases:
  mydb:
    host: localhost
    database: mydatabase
    user: postgres
    password: ${DB_PASSWORD}
    port: 5432

llm:
  api_key: ${KIMI_API_KEY}
  base_url: https://api.moonshot.cn/v1
  model: kimi-k2-thinking-turbo
```

3. Set environment variables:
```bash
export KIMI_API_KEY="your-api-key"
export DB_PASSWORD="your-db-password"
```

## Running the Server

### Standalone Mode

```bash
python main.py
```

With custom config:
```bash
python main.py --config /path/to/config.yaml
```

Verbose logging:
```bash
python main.py --verbose
```

### Claude Desktop Integration

Add to your Claude Desktop configuration file:

#### macOS
```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "postgres": {
      "command": "/usr/local/bin/python3",
      "args": ["/path/to/pg-mcp/main.py", "--config", "/path/to/config.yaml"]
    }
  }
}
```

#### Windows
```json
// %APPDATA%\Claude\claude_desktop_config.json
{
  "mcpServers": {
    "postgres": {
      "command": "python",
      "args": ["C:\\path\\to\\pg-mcp\\main.py", "--config", "C:\\path\\to\\config.yaml"]
    }
  }
}
```

#### Linux
```json
// ~/.config/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "postgres": {
      "command": "/usr/bin/python3",
      "args": ["/path/to/pg-mcp/main.py", "--config", "/path/to/config.yaml"]
    }
  }
}
```

## Using the Tools

### 1. Query Database (Natural Language)

Ask questions in natural language:

```
User: "Get the top 10 customers by total order value from the mydb database"

Tool: query_database
{
  "query": "Get the top 10 customers by total order value",
  "database": "mydb",
  "validate": true
}
```

The server will:
1. Generate SQL from your natural language query
2. Validate the SQL for security
3. Execute the query
4. Optionally validate results using LLM

### 2. Execute SQL Directly

Execute SQL queries with validation:

```
Tool: execute_sql
{
  "sql": "SELECT * FROM customers WHERE country = 'USA' LIMIT 100",
  "database": "mydb"
}
```

Note: Only SELECT queries are allowed. DDL and DML statements are blocked for security.

### 3. List Databases

Check database connections:

```
Tool: list_databases
{}
```

Returns:
```json
{
  "success": true,
  "databases": [
    {
      "id": "mydb",
      "host": "localhost",
      "database": "mydatabase",
      "connected": true,
      "status": "Connected",
      "tables_count": 42
    }
  ]
}
```

### 4. Refresh Schema

Update schema cache after database changes:

```
Tool: refresh_schema
{
  "database": "mydb"
}
```

## Error Handling

The server returns structured JSON responses for all operations:

### Success Response
```json
{
  "success": true,
  "query": "Get top 10 customers",
  "sql": "SELECT * FROM customers ORDER BY total_orders DESC LIMIT 10",
  "results": [...],
  "columns": [...],
  "row_count": 10,
  "execution_time": 0.123
}
```

### Error Response
```json
{
  "success": false,
  "error_code": "SECURITY_ERROR",
  "error": "SQL validation failed: DROP statements not allowed",
  "_timestamp": 1705112345.678
}
```

Common error codes:
- `DB_NOT_FOUND` - Database not configured
- `DB_CONNECTION_ERROR` - Cannot connect to database
- `SECURITY_ERROR` - SQL failed security validation
- `SCHEMA_ERROR` - Schema discovery failed
- `LLM_ERROR` - Natural language to SQL conversion failed
- `QUERY_ERROR` - Query execution failed

## Security Features

- **SQL Validation**: All queries validated using SQLGlot
- **Query Whitelisting**: Only SELECT queries allowed by default
- **Parameter Sanitation**: All inputs sanitized
- **Connection Pooling**: Secure connection management
- **Schema Caching**: Efficient metadata handling

## Testing

Run the test suite:

```bash
# Unit tests
pytest tests/unit/

# Integration tests
pytest tests/integration/

# Test MCP server
python test_mcp_server.py
```

## Debugging

Enable debug logging:

```bash
python main.py --verbose
```

Common issues:

1. **"DB_NOT_FOUND" error**
   - Check config.yaml for correct database ID
   - Ensure database is configured properly

2. **"SECURITY_ERROR"**
   - Verify your SQL is a SELECT statement
   - Check for disallowed keywords

3. **"LLM_ERROR"**
   - Verify KIMI_API_KEY is set
   - Check network connectivity to Kimi API

4. **Connection issues**
   - Verify PostgreSQL is running
   - Check credentials in config
   - Test with psql: `psql -h localhost -U postgres`

## Architecture

The MCP Server integrates with the existing pg-mcp architecture:

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  MCP Client     │     │  PostgresMCP     │     │  QueryService    │
│  (Claude Desktop)│────▶│     Server       │────▶│  (Business Logic)│
└─────────────────┘     └──────────────────┘     └──────────────────┘
                                                       │
                    ┌──────────────────┐              │
                    │  MCP Protocol    │              ▼
                    │  (JSON-RPC)      │     ┌──────────────────┐
                    └──────────────────┘     │  Components      │
                                               │  - DatabaseManager│
                                               │  - SchemaManager  │
                                               │  - LLMService     │
                                               │  - QueryExecutor  │
                                               └──────────────────┘
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

## License

MIT License - See [LICENSE](../LICENSE) for details.
