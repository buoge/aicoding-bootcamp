# pg-mcp HTTP Server

HTTP REST API wrapper for the PostgreSQL MCP Server, providing easy access to natural language SQL queries and database operations.

## 🚀 Quick Start

### Start the Server

```bash
cd /Users/buoge/Desktop/github/aicoding-bootcamp/w5/pg-mcp
python http_server.py
```

Server will start on: **http://localhost:8000/mcp**

### API Documentation

Interactive API docs available at:
- **Swagger UI**: http://localhost:8000/mcp/docs
- **ReDoc**: http://localhost:8000/mcp/redoc

## 📡 API Endpoints

### 1. Health Check

```bash
GET http://localhost:8000/mcp
GET http://localhost:8000/mcp/health
```

**Response:**
```json
{
  "status": "healthy",
  "databases": ["main"],
  "timestamp": 1728047.065
}
```

### 2. List Databases

Get all configured databases and their connection status.

```bash
GET http://localhost:8000/mcp/databases
```

**Response:**
```json
{
  "success": true,
  "databases": [
    {
      "id": "main",
      "host": "localhost",
      "database": "mydatabase",
      "connected": true,
      "status": "Connected",
      "tables_count": 42
    }
  ]
}
```

### 3. Natural Language Query

Convert natural language to SQL and execute.

```bash
POST http://localhost:8000/mcp/query
Content-Type: application/json

{
  "query": "查询前10个用户的姓名和邮箱",
  "database": "main",
  "validate": false
}
```

**Response:**
```json
{
  "success": true,
  "query": "查询前10个用户的姓名和邮箱",
  "sql": "SELECT name, email FROM users LIMIT 10",
  "results": [
    {"name": "John Doe", "email": "john@example.com"},
    ...
  ],
  "columns": ["name", "email"],
  "row_count": 10,
  "execution_time": 0.123
}
```

### 4. Execute SQL

Execute direct SQL queries with security validation.

```bash
POST http://localhost:8000/mcp/execute
Content-Type: application/json

{
  "sql": "SELECT * FROM users WHERE country = 'USA' LIMIT 100",
  "database": "main"
}
```

**Response:**
```json
{
  "success": true,
  "sql": "SELECT * FROM users WHERE country = 'USA' LIMIT 100",
  "results": [...],
  "columns": ["id", "name", "email", "country"],
  "row_count": 100,
  "execution_time": 0.045
}
```

### 5. Refresh Schema

Update the database schema cache.

```bash
POST http://localhost:8000/mcp/refresh-schema
Content-Type: application/json

{
  "database": "main"
}
```

**Response:**
```json
{
  "success": true,
  "database": "main",
  "tables_count": 42,
  "message": "Schema refreshed successfully"
}
```

## 🧪 Testing with curl

### Health Check
```bash
curl http://localhost:8000/mcp/health | jq
```

### List Databases
```bash
curl http://localhost:8000/mcp/databases | jq
```

### Natural Language Query
```bash
curl -X POST http://localhost:8000/mcp/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "查询前5个用户",
    "database": "main",
    "validate": false
  }' | jq
```

### Execute SQL
```bash
curl -X POST http://localhost:8000/mcp/execute \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM users LIMIT 5",
    "database": "main"
  }' | jq
```

### Refresh Schema
```bash
curl -X POST http://localhost:8000/mcp/refresh-schema \
  -H "Content-Type: application/json" \
  -d '{
    "database": "main"
  }' | jq
```

## 🐍 Testing with Python

Run the test script:

```bash
python test_http_api.py
```

Or use the requests library directly:

```python
import requests

# Health check
response = requests.get("http://localhost:8000/mcp/health")
print(response.json())

# Natural language query
response = requests.post(
    "http://localhost:8000/mcp/query",
    json={
        "query": "查询所有管理员用户",
        "database": "main",
        "validate": False
    }
)
print(response.json())
```

## 🔒 Security Features

- ✅ **SQL Validation**: All queries validated using SQLGlot
- ✅ **Query Whitelisting**: Only SELECT queries allowed by default
- ✅ **Parameter Sanitation**: All inputs sanitized
- ✅ **Connection Pooling**: Secure connection management
- ✅ **CORS Enabled**: Configurable CORS for API access

## ⚠️ Error Responses

All endpoints return structured JSON error responses:

```json
{
  "success": false,
  "error_code": "SECURITY_ERROR",
  "error": "SQL validation failed: DROP statements not allowed",
  "_timestamp": 1705112345.678
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `DB_NOT_FOUND` | Database not configured | 500 |
| `DB_CONNECTION_ERROR` | Cannot connect to database | 500 |
| `SECURITY_ERROR` | SQL failed security validation | 400 |
| `SCHEMA_ERROR` | Schema discovery failed | 500 |
| `LLM_ERROR` | Natural language to SQL conversion failed | 500 |
| `QUERY_ERROR` | Query execution failed | 500 |
| `EXECUTION_ERROR` | Unexpected execution error | 500 |

## 🔧 Configuration

The HTTP server uses the same configuration as the MCP server:

```yaml
# config/config.yaml
databases:
  main:
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

## 📊 Monitoring

### Server Logs

The server provides detailed logging:

```
2026-01-13 14:15:08 - INFO - ============================================================
2026-01-13 14:15:08 - INFO - 🎉 pg-mcp HTTP Server Started!
2026-01-13 14:15:08 - INFO - ============================================================
2026-01-13 14:15:08 - INFO - 📍 API Base URL: http://localhost:8000/mcp
2026-01-13 14:15:08 - INFO - 📚 API Docs: http://localhost:8000/mcp/docs
```

### Access Logs

All API requests are logged by uvicorn:

```
INFO:     127.0.0.1:52891 - "GET /mcp/health HTTP/1.1" 200 OK
INFO:     127.0.0.1:52892 - "POST /mcp/query HTTP/1.1" 200 OK
```

## 🎯 Use Cases

### 1. Web Applications
Integrate natural language SQL queries into web applications:

```javascript
async function queryDatabase(query) {
  const response = await fetch('http://localhost:8000/mcp/query', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      query: query,
      database: 'main',
      validate: false
    })
  });
  return await response.json();
}
```

### 2. Data Analysis Tools
Build data analysis dashboards with natural language queries.

### 3. Chatbots
Enable chatbots to query databases using natural language.

### 4. Internal Tools
Create internal tools for non-technical users to query databases.

## 🚦 Production Deployment

For production use, consider:

1. **Add Authentication**: Implement JWT or API key authentication
2. **Rate Limiting**: Add rate limiting to prevent abuse
3. **HTTPS**: Use HTTPS with proper SSL certificates
4. **Monitoring**: Add monitoring and alerting
5. **Load Balancing**: Use a load balancer for high availability

## 📝 Comparison: HTTP vs MCP

| Feature | HTTP Server | MCP Server |
|---------|-------------|------------|
| **Access Method** | HTTP REST API | stdio (JSON-RPC) |
| **Use Case** | Web apps, APIs | Claude Desktop/CLI |
| **Authentication** | Can add JWT/API key | Process-based |
| **Documentation** | Swagger/ReDoc | MCP Protocol |
| **Port** | 8000 | N/A (stdin/stdout) |

## 🆘 Troubleshooting

### Server won't start
```bash
# Check if port 8000 is in use
lsof -i :8000

# Use a different port
# Edit http_server.py line 321: port=8001
```

### Database connection error
```bash
# Test database connection
psql -h localhost -U postgres -d mydatabase

# Check config/config.yaml
cat config/config.yaml
```

### Module not found errors
```bash
# Install dependencies
pip install asyncpg mcp openai sqlglot requests fastapi uvicorn
```

## 📚 Related Files

- `http_server.py` - HTTP server implementation
- `test_http_api.py` - Test script for HTTP API
- `start_server.py` - Original MCP stdio server
- `main.py` - MCP server entry point for Claude integration

## 🎓 Learn More

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Happy Querying! 🎉**
