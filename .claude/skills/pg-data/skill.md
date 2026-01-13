# PostgreSQL Database Query Skill

## Overview
This skill connects to local PostgreSQL databases and generates SQL queries from natural language descriptions. It validates SQL for security, executes queries, and returns results with confidence scoring.

PostgreSQL 数据库查询技能 - 连接本地 PostgreSQL 数据库，从自然语言描述生成 SQL 查询。验证 SQL 安全性，执行查询并返回带有置信度评分的结果。

## Supported Databases
- **simple_test**: Empty database for basic testing
- **medium_test**: Empty database for basic testing
- **complex_test**: PostGIS-enabled database with spatial data

## Capabilities
- Converts natural language to SQL SELECT queries
- Validates SQL for security (no write operations, no injections)
- Executes queries and returns results
- Provides confidence scores (0-10) for query quality
- Auto-retries if score is below threshold (< 7)
- Supports both result and SQL-only output modes

**中文支持 (Chinese Support):**
- 支持中文自然语言查询 (Supports Chinese natural language queries)
- 双语界面和错误提示 (Bilingual interface and error messages)
- 中英文关键词识别 (Recognition of Chinese and English keywords)

**Supported Chinese keywords:**
- 统计/数量/多少/计数 (Count queries)
- 前几个/前5个/前几名 (Limit queries)
- 列出/显示/查询/查看 (List/show queries)
- 坐标系统/空间参考 (Coordinate systems/spatial references)

## Requirements
- PostgreSQL running on localhost:5432
- Username: postgres, Password: postgres
- Access to simple_test, medium_test, or complex_test databases

## Usage

```bash
./db-query.sh --db <database> --query <natural_language_query> [options]
```

### Options
- `--db DATABASE`: Database name (simple_test, medium_test, complex_test)
- `--query QUERY`: Natural language query description
- `--mode MODE`: Output mode - 'result' (default) or 'sql'
- `--prompt`: Show detailed prompts and analysis
- `--help`: Display help message

### Examples

**Count records / 统计记录:**
```bash
./db-query.sh --db complex_test --query "Count all spatial reference systems"
./db-query.sh --db complex_test --query "统计有多少个空间参考系统"
./db-query.sh --db complex_test --query "srid总数是多少"
```

**List top N records / 列出前N条记录 (SQL mode):**
```bash
./db-query.sh --db complex_test --query "List first 5 spatial reference systems" --mode sql
./db-query.sh --db complex_test --query "列出前10个坐标系统" --mode result
```

**With detailed analysis / 带详细分析:**
```bash
./db-query.sh --db complex_test --query "How many srid values" --prompt
./db-query.sh --db complex_test --query "查询srid 3001的信息" --prompt
```

## Security Features
- Only allows SELECT statements
- Blocks SQL injection attempts
- Prevents time-based attacks (SLEEP, pg_sleep)
- Rejects sensitive information in queries

## Output / 输出
- **Confidence Score / 置信分数**: 0-10 rating of query quality / 查询质量的0-10评分
- **Generated SQL / 生成的SQL**: The SQL query created from natural language / 从自然语言创建的SQL查询
- **Results / 结果**: Query execution results (or SQL in sql mode) / 查询执行结果（或sql模式下的SQL）
- **History / 历史**: All queries logged to query_history.md / 所有查询记录在 query_history.md


## Schema References
Located in References/ folder:
- complex_test_reference.md
- medium_test_reference.md
- simple_test_reference.md

## Limitations
- Currently uses pattern matching for SQL generation (would benefit from LLM integration)
- Only supports 3 predefined databases
- Basic confidence scoring heuristics
