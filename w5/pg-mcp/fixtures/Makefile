# Test Database Management Makefile
# Creates and manages three test databases with different scales

# PostgreSQL connection parameters
DB_HOST ?= localhost
DB_PORT ?= 5432
DB_USER ?= postgres
DB_PASSWORD ?= 

# Database names
SIMPLE_DB := simple_test
MEDIUM_DB := medium_test
COMPLEX_DB := complex_test

# SQL files
SIMPLE_SQL := simple_db.sql
MEDIUM_SQL := medium_db.sql
COMPLEX_SQL := complex_db.sql

# PostgreSQL connection string
PSQL := PGPASSWORD=$(DB_PASSWORD) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER)
PSQL_DB := PGPASSWORD=$(DB_PASSWORD) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d

echo_pass = printf "$(1)\n"

.PHONY: help create-all drop-all recreate-all \
        simple-create simple-drop simple-recreate simple-connect simple-verify \
        medium-create medium-drop medium-recreate medium-connect medium-verify \
        complex-create complex-drop complex-recreate complex-connect complex-verify \
        list-dbs status clean

# Default target
help:
	@echo "PostgreSQL Test Database Management"
	@echo "=========================================="
	@echo ""
	@echo "Available targets:"
	@echo ""
	@echo "All Databases:"
	@echo "  make create-all        - Create all three test databases"
	@echo "  make drop-all          - Drop all three test databases"
	@echo "  make recreate-all      - Recreate all three test databases"
	@echo ""
	@echo "Simple Database (Small Scale):"
	@echo "  make simple-create     - Create simple_test database (~1000 rows)"
	@echo "  make simple-drop       - Drop simple_test database"
	@echo "  make simple-recreate   - Recreate simple_test database"
	@echo "  make simple-connect    - Connect to simple_test database"
	@echo "  make simple-verify     - Verify simple_test database data"
	@echo ""
	@echo "Medium Database (Medium Scale):"
	@echo "  make medium-create     - Create medium_test database (~100,000 rows)"
	@echo "  make medium-drop       - Drop medium_test database"
	@echo "  make medium-recreate   - Recreate medium_test database"
	@echo "  make medium-connect    - Connect to medium_test database"
	@echo "  make medium-verify     - Verify medium_test database data"
	@echo ""
	@echo "Complex Database (Large Scale):"
	@echo "  make complex-create    - Create complex_test database (~2,000,000 rows)"
	@echo "  make complex-drop      - Drop complex_test database"
	@echo "  make complex-recreate  - Recreate complex_test database"
	@echo "  make complex-connect   - Connect to complex_test database"
	@echo "  make complex-verify    - Verify complex_test database data"
	@echo ""
	@echo "Utility:"
	@echo "  make list-dbs          - List all PostgreSQL databases"
	@echo "  make status            - Show database sizes and connection info"
	@echo "  make clean             - Clean SQL files (if needed)"

# Check PostgreSQL connection
check-connection:
	@echo "Checking PostgreSQL connection..."
	@$(PSQL) -c "SELECT version();" > /dev/null 2>&1 || \
		{ echo "Error: Cannot connect to PostgreSQL. Please check connection parameters."; exit 1; }
	@echo "PostgreSQL connection successful"

# List all databases
list-dbs:
	@echo "Listing all PostgreSQL databases:"
	@$(PSQL) -c "SELECT datname, pg_size_pretty(pg_database_size(datname)), datconnlimit FROM pg_database ORDER BY datname;"

# Show database status
status: check-connection
	@echo ""
	@echo "Test Database Status:"
	@echo "=========================================="
	@echo "simple_test: $$($(PSQL) -X -A -t -c "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_database WHERE datname = '$(SIMPLE_DB)') THEN 'EXISTS (' || pg_size_pretty(pg_database_size('$(SIMPLE_DB)')) || ')' ELSE 'NOT EXISTS' END FROM pg_database WHERE datname = '$(SIMPLE_DB)' UNION SELECT 'N/A' LIMIT 1")"
	@echo "medium_test: $$($(PSQL) -X -A -t -c "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_database WHERE datname = '$(MEDIUM_DB)') THEN 'EXISTS (' || pg_size_pretty(pg_database_size('$(MEDIUM_DB)')) || ')' ELSE 'NOT EXISTS' END FROM pg_database WHERE datname = '$(MEDIUM_DB)' UNION SELECT 'N/A' LIMIT 1")"
	@echo "complex_test: $$($(PSQL) -X -A -t -c "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_database WHERE datname = '$(COMPLEX_DB)') THEN 'EXISTS (' || pg_size_pretty(pg_database_size('$(COMPLEX_DB)')) || ')' ELSE 'NOT EXISTS' END FROM pg_database WHERE datname = '$(COMPLEX_DB)' UNION SELECT 'N/A' LIMIT 1")"

# ==================== SIMPLE DATABASE ====================

simple-create: check-connection
	@echo "Creating simple_test database..."
	@createdb -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) $(SIMPLE_DB) 2>/dev/null || \
		{ echo "Warning: Database may already exist or permission denied"; }
	@echo "Loading simple_db.sql..."
	@$(PSQL_DB) $(SIMPLE_DB) -f $(SIMPLE_SQL)
	@echo "simple_test database created successfully"

simple-drop: check-connection
	@echo "Dropping simple_test database..."
	@dropdb -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) --if-exists $(SIMPLE_DB)
	@echo "simple_test database dropped"

simple-recreate: simple-drop simple-create

simple-connect:
	@echo "Connecting to simple_test database..."
	@$(PSQL_DB) $(SIMPLE_DB)

simple-verify: check-connection
	@echo "Verifying simple_test database..."
	@$(PSQL_DB) $(SIMPLE_DB) -c "SELECT 'customers' as table_name, COUNT(*) as row_count, pg_size_pretty(pg_total_relation_size('store.customers')) as size FROM store.customers UNION ALL SELECT 'products', COUNT(*), pg_size_pretty(pg_total_relation_size('store.products')) FROM store.products UNION ALL SELECT 'orders', COUNT(*), pg_size_pretty(pg_total_relation_size('store.orders')) FROM store.orders UNION ALL SELECT 'order_items', COUNT(*), pg_size_pretty(pg_total_relation_size('store.order_items')) FROM store.order_items;"

# ==================== MEDIUM DATABASE ====================

medium-create: check-connection
	@echo "Creating medium_test database..."
	@createdb -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) $(MEDIUM_DB) 2>/dev/null || \
		{ echo "Warning: Database may already exist or permission denied"; }
	@echo "Loading medium_db.sql..."
	@$(PSQL_DB) $(MEDIUM_DB) -f $(MEDIUM_SQL)
	@echo "medium_test database created successfully"

medium-drop: check-connection
	@echo "Dropping medium_test database..."
	@dropdb -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) --if-exists $(MEDIUM_DB)
	@echo "medium_test database dropped"

medium-recreate: medium-drop medium-create

medium-connect:
	@echo "Connecting to medium_test database..."
	@$(PSQL_DB) $(MEDIUM_DB)

medium-verify: check-connection
	@echo "Verifying medium_test database..."
	@$(PSQL_DB) $(MEDIUM_DB) -c "SELECT 'departments' as table_name, 'hr' as schema_name, COUNT(*) as row_count FROM hr.departments UNION ALL SELECT 'employees', 'hr', COUNT(*) FROM hr.employees UNION ALL SELECT 'performance_reviews', 'hr', COUNT(*) FROM hr.performance_reviews UNION ALL SELECT 'suppliers', 'inventory', COUNT(*) FROM inventory.suppliers UNION ALL SELECT 'products', 'inventory', COUNT(*) FROM inventory.products UNION ALL SELECT 'stock_movements', 'inventory', COUNT(*) FROM inventory.stock_movements UNION ALL SELECT 'customers', 'sales', COUNT(*) FROM sales.customers UNION ALL SELECT 'orders', 'sales', COUNT(*) FROM sales.orders UNION ALL SELECT 'order_items', 'sales', COUNT(*) FROM sales.order_items UNION ALL SELECT 'payments', 'sales', COUNT(*) FROM sales.payments;"

# ==================== COMPLEX DATABASE ====================

complex-create: check-connection
	@echo "Creating complex_test database..."
	@echo "Note: This will take several minutes..."
	@createdb -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) $(COMPLEX_DB) 2>/dev/null || \
		{ echo "Warning: Database may already exist or permission denied"; }
	@echo "Loading complex_db.sql..."
	@$(PSQL_DB) $(COMPLEX_DB) -f $(COMPLEX_SQL)
	@echo "complex_test database created successfully"

complex-drop: check-connection
	@echo "Dropping complex_test database..."
	@dropdb -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) --if-exists $(COMPLEX_DB)
	@echo "complex_test database dropped"

complex-recreate: complex-drop complex-create

complex-connect:
	@echo "Connecting to complex_test database..."
	@$(PSQL_DB) $(COMPLEX_DB)

complex-verify: check-connection
	@echo "Verifying complex_test database..."
	@$(PSQL_DB) $(COMPLEX_DB) -c "SELECT 'crm.customers' as table_name, COUNT(*) as row_count, pg_size_pretty(pg_total_relation_size('crm.customers')) as size FROM crm.customers UNION ALL SELECT 'crm.addresses', COUNT(*), pg_size_pretty(pg_total_relation_size('crm.addresses')) FROM crm.addresses UNION ALL SELECT 'ecommerce.products', COUNT(*), pg_size_pretty(pg_total_relation_size('ecommerce.products')) FROM ecommerce.products UNION ALL SELECT 'ecommerce.reviews', COUNT(*), pg_size_pretty(pg_total_relation_size('ecommerce.reviews')) FROM ecommerce.reviews UNION ALL SELECT 'finance.transactions', COUNT(*), pg_size_pretty(pg_total_relation_size('finance.transactions')) FROM finance.transactions;"

# ==================== ALL DATABASES ====================

create-all: simple-create medium-create complex-create
	@echo "All test databases created"

drop-all: simple-drop medium-drop complex-drop
	@echo "All test databases dropped"

recreate-all: drop-all create-all
	@echo "All test databases recreated"

# Clean (placeholder - in case we need to clean generated files)
clean:
	@echo "Cleaning up..."

# ==================== SHORTCUTS ====================

# Short aliases
simple: simple-create
medium: medium-create
complex: complex-create
all: create-all

s: simple-create
m: medium-create
c: complex-create

.DEFAULT_GOAL := help
