#!/bin/bash
set -euo pipefail

# Database Query Skill
# This skill connects to PostgreSQL databases, generates SQL from natural language,
# and returns results or SQL based on user preference

# Configuration
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="postgres"
DB_PASS="postgres"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REFERENCE_DIR="${SCRIPT_DIR}/References"
MAX_RETRIES=3
SCORE_THRESHOLD=7

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to show usage
usage() {
    echo -e "${BLUE}Database Query Skill - 数据库查询工具${NC}"
    echo "Usage: $0 --db <database> --query <natural_language_query> [--mode <result|sql>] [--prompt]"
    echo ""
    echo "Options / 选项:"
    echo "  --db DATABASE       Database name / 数据库名称 (simple_test, medium_test, complex_test)"
    echo "  --query QUERY       Natural language query description / 自然语言查询描述"
    echo "  --mode MODE         Output mode / 输出模式: 'result' (default 默认) or 'sql'"
    echo "  --prompt            Show detailed prompts and analysis / 显示详细的提示和分析"
    echo "  --help              Show this help message / 显示此帮助信息"
    echo ""
    echo "Examples / 示例:"
    echo "  $0 --db complex_test --query 'How many spatial reference systems are there?'"
    echo "  $0 --db complex_test --query '统计有多少个空间参考系统'"
    echo "  $0 --db complex_test --query 'List first 5 spatial reference systems' --mode sql"
    echo "  $0 --db complex_test --query '列出前5个空间参考系统' --prompt"
}

# Parse command line arguments
DATABASE=""
USER_QUERY=""
MODE="result"
SHOW_PROMPT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --db)
            DATABASE="$2"
            shift 2
            ;;
        --query)
            USER_QUERY="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --prompt)
            SHOW_PROMPT=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Validate inputs
if [[ -z "$DATABASE" ]]; then
    echo -e "${RED}Error / 错误: Database name is required / 需要指定数据库名称${NC}"
    usage
    exit 1
fi

if [[ -z "$USER_QUERY" ]]; then
    echo -e "${RED}Error / 错误: Query description is required / 需要指定查询描述${NC}"
    usage
    exit 1
fi

if [[ "$MODE" != "result" && "$MODE" != "sql" ]]; then
    echo -e "${RED}Error / 错误: Mode must be 'result' or 'sql' / 模式必须是 'result' 或 'sql'${NC}"
    exit 1
fi

# Validate database
if [[ "$DATABASE" != "simple_test" && "$DATABASE" != "medium_test" && "$DATABASE" != "complex_test" ]]; then
    echo -e "${RED}Error / 错误: Unknown database '$DATABASE'. Available / 可用数据库: simple_test, medium_test, complex_test${NC}"
    exit 1
fi

REFERENCE_FILE="${REFERENCE_DIR}/${DATABASE}_reference.md"
if [[ ! -f "$REFERENCE_FILE" ]]; then
    echo -e "${RED}Error / 错误: Reference file not found / 找不到文件: $REFERENCE_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}Database Query Skill - 数据库查询${NC}"
echo -e "Database / 数据库: ${GREEN}$DATABASE${NC}"
echo -e "Query / 查询: ${GREEN}$USER_QUERY${NC}"
echo -e "Mode / 模式: ${GREEN}$MODE${NC}"
echo ""

# Function to read reference file
read_reference() {
    cat "$REFERENCE_FILE"
}

# Function to validate SQL (basic checks)
validate_sql() {
    local sql="$1"

    # Check for write operations
    local write_ops=("INSERT" "UPDATE" "DELETE" "DROP" "CREATE" "ALTER" "TRUNCATE")
    for op in "${write_ops[@]}"; do
        if echo "$sql" | grep -qi "$op"; then
            echo -e "${RED}Error / 错误: SQL contains write operation / 包含写操作 '$op'${NC}"
            return 1
        fi
    done

    # Check for dangerous operations (SQL injection, time delays, etc.)
    # Note: We allow semicolons at the end and SQL comments for legitimate queries
    local danger_ops=("SLEEP(" "pg_sleep(" "benchmark(" "BENCHMARK(")
    for op in "${danger_ops[@]}"; do
        if echo "$sql" | grep -qi "$op"; then
            echo -e "${RED}Error / 错误: SQL contains dangerous operation / 包含危险操作 '$op'${NC}"
            return 1
        fi
    done

    # Check for potential injection patterns in the middle of SQL (not at end)
    if echo "$sql" | grep -qiE ";.*(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER)"; then
        echo -e "${RED}Error / 错误: SQL contains potential injection pattern / 包含潜在的注入模式${NC}"
        return 1
    fi

    # Check for comment-based injections
    if echo "$sql" | grep -qiE "\'.*--"; then
        echo -e "${RED}Error / 错误: SQL contains potential comment injection / 包含潜在的注释注入${NC}"
        return 1
    fi

    # Check for API keys or sensitive patterns
    if echo "$sql" | grep -qiE "(api_key|apikey|password|secret|token)"; then
        echo -e "${RED}Error / 错误: SQL contains potential sensitive information / 包含潜在的敏感信息${NC}"
        return 1
    fi

    return 0
}

# Function to execute SQL and get results
execute_sql() {
    local sql="$1"
    local limit="$2"

    # Execute SQL with limit
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DATABASE" \
        -c "$sql" -t -A --pset="footer=off" 2>&1 | head -n "$limit"
}

# Function to analyze results and score confidence
calculate_confidence() {
    local user_query="$1"
    local sql="$2"
    local result="$3"

    # Simple heuristic scoring (in a real scenario, this would use an LLM)
    local score=5

    # Check if result is empty
    if [[ -z "$result" || "$result" == "(0 row)" || "$result" == "(0 rows)" ]]; then
        echo "0:empty"
        return
    fi

    # Check for error messages
    if echo "$result" | grep -qiE "(error|syntax|permission|invalid|does not exist)"; then
        echo "0:error"
        return
    fi

    # Check length of result
    local line_count=$(echo "$result" | wc -l)
    if [[ $line_count -gt 0 && $line_count -lt 100 ]]; then
        score=7
    fi

    # Check if result has columns (must have multiple entries)
    if echo "$result" | head -1 | grep -q "|"; then
        score=$((score + 1))
    fi

    # Check if result is numeric (often good for queries)
    if echo "$result" | head -1 | grep -qE "^[0-9]+$"; then
        score=$((score + 2))
    fi

    # Cap at 10
    if [[ $score -gt 10 ]]; then
        score=10
    fi

    echo "$score:heuristic"
}

# Function to get SQL suggestion using pattern matching (supports Chinese and English)
get_sql_suggestion() {
    local reference="$1"
    local query="$2"
    local query_lower="$(echo "$query" | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]/ /g')"

    # Helper function to check if query contains any of the patterns
    contains_pattern() {
        local text="$1"
        shift
        local patterns=("$@")
        for pattern in "${patterns[@]}"; do
            if echo "$text" | grep -qF "$pattern"; then
                return 0
            fi
        done
        return 1
    }

    # Count queries (English: count, 中文: 数量、统计、多少、计数、count)
    local count_patterns=("count" "数量" "统计" "多少" "计数" "数量" "总数")
    if contains_pattern "$query_lower" "${count_patterns[@]}"; then
        if contains_pattern "$query_lower" "srid" || contains_pattern "$query_lower" "spatial_ref_sys"; then
            echo "SELECT COUNT(*) FROM spatial_ref_sys;"
            return
        else
            # If not specified, assume they want to count from the main spatial table
            echo "SELECT COUNT(*) FROM spatial_ref_sys;"
            return
        fi
    fi

    # Limit queries by number (English: first, top, limit,  中文: 前几个、前5个、前几名、前五条)
    local limit_patterns=("first" "top" "limit" "前" "前几" "前几个" "前五" "前五个")
    if contains_pattern "$query_lower" "${limit_patterns[@]}"; then
        # Extract number from query (English: 5, ten, 20 / 中文: 5个, 十条, 二十)
        local limit_num=5
        if echo "$query_lower" | grep -qE "([0-9]+)"; then
            limit_num=$(echo "$query_lower" | grep -oE "([0-9]+)" | head -1)
        elif echo "$query_lower" | grep -q "十"; then
            limit_num=10
        elif echo "$query_lower" | grep -q "三"; then
            limit_num=3
        fi

        if contains_pattern "$query_lower" "srid" || contains_pattern "$query_lower" "空间" || contains_pattern "$query_lower" "坐标" || contains_pattern "$query_lower" "reference"; then
            echo "SELECT srid, auth_name, srtext FROM spatial_ref_sys ORDER BY srid LIMIT ${limit_num};"
            return
        else
            echo "SELECT * FROM spatial_ref_sys ORDER BY srid LIMIT ${limit_num};"
            return
        fi
    fi

    # List/show/find queries (English: list, show, find, display, 中文: 列出、显示、查询、查看、展示、list)
    local list_patterns=("list" "show" "find" "display" "列出" "显示" "查询" "查看" "展示" "列举")
    if contains_pattern "$query_lower" "${list_patterns[@]}"; then
        local limit_num=10
        if echo "$query_lower" | grep -qE "([0-9]+)"; then
            limit_num=$(echo "$query_lower" | grep -oE "([0-9]+)" | head -1)
        fi

        if contains_pattern "$query_lower" "srid"; then
            echo "SELECT srid FROM spatial_ref_sys ORDER BY srid LIMIT ${limit_num};"
            return
        elif contains_pattern "$query_lower" "auth_name"; then
            echo "SELECT DISTINCT auth_name FROM spatial_ref_sys ORDER BY auth_name LIMIT ${limit_num};"
            return
        elif contains_pattern "$query_lower" "srtext" || contains_pattern "$query_lower" "description"; then
            echo "SELECT srid, auth_name, srtext FROM spatial_ref_sys ORDER BY srid LIMIT ${limit_num};"
            return
        elif contains_pattern "$query_lower" "空间" || contains_pattern "$query_lower" "坐标"; then
            echo "SELECT srid, auth_name, srtext FROM spatial_ref_sys WHERE srtext LIKE '%' ORDER BY srid;"
            return
        else
            echo "SELECT srid, auth_name, srtext FROM spatial_ref_sys ORDER BY srid LIMIT ${limit_num};"
            return
        fi
    fi

    # Specific SRID lookup (English: what is srid, 中文: srid是什么、srid4326是什么)
    if echo "$query_lower" | grep -qE "srid[[:space:]]*([0-9]+)"; then
        local srid_num=$(echo "$query_lower" | grep -oE "([0-9]+)" | head -1)
        if [[ -n "$srid_num" ]]; then
            echo "SELECT * FROM spatial_ref_sys WHERE srid = ${srid_num};"
            return
        fi
    fi

    # Default query
    echo "SELECT srid, auth_name, srtext FROM spatial_ref_sys LIMIT 5;"
}

# Main processing
REFERENCE_CONTENT=$(read_reference)
ATTEMPT=1
BEST_SCORE=0
BEST_SQL=""
BEST_RESULT=""

while [[ $ATTEMPT -le $MAX_RETRIES ]]; do
    echo -e "${YELLOW}Attempt $ATTEMPT of $MAX_RETRIES${NC}"

    # Get SQL suggestion
    if [[ $SHOW_PROMPT == true ]]; then
        echo -e "${BLUE}Generating SQL based on:${NC}"
        echo "User Query: $USER_QUERY"
        echo "Database Schema: $(echo "$REFERENCE_CONTENT" | head -20 | tr '\n' ' ')"
    fi

    SQL_QUERY=$(get_sql_suggestion "$REFERENCE_CONTENT" "$USER_QUERY")

    if [[ $SHOW_PROMPT == true ]]; then
        echo -e "${BLUE}Generated SQL:${NC}"
        echo "$SQL_QUERY"
    fi

    # Validate SQL
    if ! validate_sql "$SQL_QUERY"; then
        echo -e "${RED}SQL validation failed, retrying...${NC}"
        ATTEMPT=$((ATTEMPT + 1))
        sleep 1
        continue
    fi

    # Execute SQL
    echo -e "${BLUE}Executing SQL...${NC}"
    RESULT=$(execute_sql "$SQL_QUERY" 100)

    if [[ $SHOW_PROMPT == true ]]; then
        echo -e "${BLUE}Query Result (first 20 lines):${NC}"
        echo "$RESULT" | head -20
    fi

    # Calculate confidence score
    SCORE_INFO=$(calculate_confidence "$USER_QUERY" "$SQL_QUERY" "$RESULT")
    SCORE=$(echo "$SCORE_INFO" | cut -d: -f1)
    REASON=$(echo "$SCORE_INFO" | cut -d: -f2)

    echo -e "Confidence Score: ${GREEN}$SCORE/10${NC} (Reason: $REASON)"

    # Store best result
    if [[ $SCORE -gt $BEST_SCORE ]]; then
        BEST_SCORE=$SCORE
        BEST_SQL="$SQL_QUERY"
        BEST_RESULT="$RESULT"
    fi

    # Check if score is good enough
    if [[ $SCORE -ge $SCORE_THRESHOLD ]]; then
        echo -e "${GREEN}Score meets threshold, accepting result${NC}"
        break
    fi

    echo -e "${YELLOW}Score below threshold, retrying...${NC}"
    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
done

# Show final result
echo ""
echo -e "${BLUE}=== FINAL RESULT ===${NC}"
echo -e "Best Score: $BEST_SCORE/10"
echo -e "Final SQL Query:"
echo -e "${GREEN}$BEST_SQL${NC}"

if [[ "$MODE" == "sql" ]]; then
    echo ""
    echo -e "${BLUE}Returning SQL only${NC}"
    echo "$BEST_SQL"
else
    echo ""
    echo -e "${BLUE}Query Results:${NC}"
    if [[ $BEST_SCORE -eq 0 ]]; then
        echo -e "${RED}No valid results obtained after $MAX_RETRIES attempts${NC}"
        echo "Please try rephrasing your query."
        exit 1
    else
        echo "$BEST_RESULT"
    fi
fi

# Save to history
HISTORY_FILE="${SCRIPT_DIR}/query_history.md"
{
    echo "## $(date '+%Y-%m-%d %H:%M:%S')"
    echo "- Database: \`$DATABASE\`"
    echo "- Query: \`$USER_QUERY\`"
    echo "- Mode: \`$MODE\`"
    echo "- Score: \`$BEST_SCORE/10\`"
    echo "- SQL:"
    echo "\`\`\`sql"
    echo "$BEST_SQL"
    echo "\`\`\`"
    echo "- Result:"
    echo "\`\`\`"
    echo "$BEST_RESULT"
    echo "\`\`\`"
    echo ""
} >> "$HISTORY_FILE"

exit 0
