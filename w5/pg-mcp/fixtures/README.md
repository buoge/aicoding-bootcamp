# Test Database Fixtures

This directory contains three test databases of varying complexity and scale for testing the pg-mcp project.

## Database Schemas

### 1. Simple Database (`simple_test`)
**Scale**: Small (~1,000 rows total)
- **Purpose**: Quick testing and basic functionality verification
- **Schema**: Store management (customers, products, orders, order_items)
- **Features**:
  - 4 tables with simple relationships
  - 2 views (customer_order_stats, product_sales_stats)
  - 1 custom type (order_status enum)
  - Basic indexes
  - ~200 customers, 50 products, 500 orders

**Use Cases**:
- Unit testing
- Development smoke tests
- Quick validation of basic features

### 2. Medium Database (`medium_test`)
**Scale**: Medium (~100,000 rows total)
- **Purpose**: Integration testing and performance testing
- **Schema**: Multi-module enterprise system
  - **HR Module**: departments, employees, performance_reviews
  - **Inventory Module**: suppliers, categories, products, locations, stock, movements
  - **Sales Module**: customers, addresses, orders, order_items, payments
- **Features**:
  - 9 tables with complex relationships
  - 4 views (including multi-table joins)
  - 2 materialized views with unique indexes
  - 3 custom types (enums)
  - 20+ indexes (single-column, multi-column, foreign key)
  - Foreign key constraints with ON DELETE CASCADE
  - ~10,000 customers, 500 products, 25,000 orders

**Use Cases**:
- Integration testing
- Schema discovery testing
- JOIN performance testing
- Materialized view testing

### 3. Complex Database (`complex_test`)
**Scale**: Large (~2,000,000 rows total)
- **Purpose**: Stress testing, advanced feature testing, complex query validation
- **Schema**: Full enterprise e-commerce platform
  - **CRM Module**: customers (partitioned), addresses, interactions, lifecycle_events (partitioned)
  - **Ecommerce Module**: brands, categories (nested), products (50K rows), price_history (partitioned), reviews, wishlists
  - **Finance Module**: payment_gateways, transactions (partitioned - 2M rows), refunds
  - **Analytics Module**: sessions, page_views
- **Features**:
  - 15+ tables with multiple partitioning strategies
  - 50,000 products for testing large-scale operations
  - 2,000,000 transactions for performance testing
  - Complex indexes (GIN, GiST, partial, expression, composite)
  - Custom composite types (e.g., address_type)
  - JSONB columns for flexible data
  - Arrays for tags and categories
  - Full-text search (tsvector)
  - PostGIS extension for geospatial data
  - Triggers (updated_at, lifecycle events, search vectors)
  - Stored procedures and functions
  - Materialized views with refresh capabilities

**Use Cases**:
- Performance/stress testing
- Complex query patterns
- Partition testing
- Multi-schema queries
- Advanced PostgreSQL features
- Realistic production simulation

## Quick Start

### Prerequisites
- PostgreSQL 13+ installed locally
- `createdb` and `dropdb` commands available
- psql command-line tool

### Environment Configuration
Set PostgreSQL connection parameters (optional, defaults to localhost:5432 as postgres):

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=your_password
```

Or use inline:
```bash
make create-all DB_PASSWORD=your_password
```

### Creating Test Databases

#### Using Make Commands
```bash
# Create all three databases
make create-all

# Create individual databases
make simple-create     # Small database (~5 seconds)
make medium-create     # Medium database (~30 seconds)
make complex-create    # Large database (~5-10 minutes)

# Drop databases
make simple-drop
make medium-drop
make complex-drop

# Recreate databases (drop + create)
make simple-recreate
make medium-recreate
make complex-recreate
```

#### Connect to Database
```bash
make simple-connect    # psql to simple_test
make medium-connect
make complex-connect
```

#### Verify Database Content
```bash
make simple-verify     # Show table statistics
make medium-verify
make complex-verify
```

#### Check Database Status
```bash
make status           # Size and existence of all test DBs
make list-dbs         # List all PostgreSQL databases
```

### Shortcut Aliases
```bash
make simple    # Same as simple-create
make medium    # Same as medium-create
make complex   # Same as complex-create
make all       # Same as create-all

make s         # Quick alias for simple
make m         # Quick alias for medium
make c         # Quick alias for complex
```

## Database Details

### Simple Database Structure
```
Schema: store
├── customers (200 rows)
├── products (50 rows)
├── orders (500 rows)
└── order_items (2000 rows)

Views:
├── customer_order_stats
└── product_sales_stats
```

### Medium Database Structure
```
Schema: hr
├── departments (10 rows)
├── employees (1000 rows)
└── performance_reviews (4000 rows)

Schema: inventory
├── suppliers (50 rows)
├── categories (8 rows)
├── products (500 rows)
├── locations (5 rows)
├── stock (2500 rows)
└── stock_movements (10000 rows)

Schema: sales
├── customers (10000 rows)
├── customer_addresses (25000 rows)
├── orders (25000 rows)
├── order_items (100000 rows)
└── payments (25000 rows)
```

### Complex Database Structure
```
Schema: crm
├── customers (1000 rows, partitioned by registration_date)
├── addresses (3000 rows)
├── interactions (50000 rows)
└── lifecycle_events (partitioned by event_timestamp)

Schema: ecommerce
├── brands (200 rows)
├── categories (200 rows, nested tree)
├── products (50000 rows) ⚡ Main stress test table
├── price_history (partitioned)
├── reviews (100000 rows)
└── wishlists (50000 rows)

Schema: finance
├── payment_gateways (200 rows)
├── transactions (2000000 rows) ⚡ Largest table
└── refunds (100000 rows)

Schema: analytics
├── sessions (50000 rows)
└── page_views (500000 rows)
```

## SQL Examples

### Simple Database Queries
```sql
-- Basic customer analysis (simple_test)
SELECT * FROM store.customer_order_stats LIMIT 10;
SELECT * FROM store.product_sales_stats WHERE total_revenue > 1000;

-- Simple JOIN
SELECT c.first_name, c.last_name, COUNT(o.order_id) as order_count
FROM store.customers c
LEFT JOIN store.orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.first_name, c.last_name
HAVING COUNT(o.order_id) > 3;
```

### Medium Database Queries
```sql
-- Complex multi-schema JOIN (medium_test)
SELECT
    d.department_name,
    COUNT(DISTINCT e.employee_id) as employee_count,
    AVG(e.salary) as avg_salary,
    AVG(pr.rating) as avg_performance_rating
FROM hr.departments d
JOIN hr.employees e ON d.department_id = e.department_id
LEFT JOIN hr.performance_reviews pr ON e.employee_id = pr.employee_id
GROUP BY d.department_id, d.department_name
HAVING COUNT(DISTINCT e.employee_id) > 10;

-- Materialized view query
SELECT * FROM inventory.product_stock_status WHERE stock_status = 'low_stock';

-- Window functions
SELECT
    p.product_name,
    s.quantity,
    SUM(s.quantity) OVER (PARTITION BY p.category_id) as category_total_stock,
    RANK() OVER (ORDER BY s.quantity DESC) as stock_rank
FROM inventory.products p
JOIN inventory.stock s ON p.product_id = s.product_id;
```

### Complex Database Queries
```sql
-- Partition pruning demonstration (complex_test)
EXPLAIN ANALYZE
SELECT * FROM crm.customers
WHERE registration_date >= '2024-01-01'
AND registration_date < '2024-02-01';

-- Complex JSONB queries
SELECT
    customer_id,
    email,
    preferences->>'newsletter_frequency' as newsletter_pref,
    preferences->>'marketing_opt_in' as marketing_opt_in
FROM crm.customers
WHERE preferences @> '{"marketing_opt_in": true}'::jsonb;

-- Array operations
SELECT * FROM ecommerce.products
WHERE tags && ARRAY['electronics', 'gadget'];  -- Overlap operator

-- Full-text search
SELECT product_id, product_name, ts_rank(search_vector, query) as rank
FROM ecommerce.products,
     to_tsquery('english', 'wireless & (headphone | earbud)') query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;

-- Complex subquery with CTE
WITH monthly_sales AS (
    SELECT
        p.category_id,
        DATE_TRUNC('month', t.created_at) as month,
        SUM(t.amount) as monthly_revenue
    FROM finance.transactions t
    JOIN sales.order_items oi ON t.order_id = oi.order_id
    JOIN ecommerce.products p ON oi.product_id = p.product_id
    WHERE t.status = 'completed'
    GROUP BY p.category_id, DATE_TRUNC('month', t.created_at)
)
SELECT
    c.category_name,
    AVG(ms.monthly_revenue) as avg_monthly_revenue,
    MAX(ms.monthly_revenue) as peak_monthly_revenue
FROM monthly_sales ms
JOIN ecommerce.categories c ON ms.category_id = c.category_id
GROUP BY c.category_id, c.category_name
HAVING AVG(ms.monthly_revenue) > 100000;

-- Geospatial query (requires PostGIS)
SELECT
    a.address_id,
    (a.address_data).city as city,
    ST_Distance(
        ST_SetSRID(ST_MakePoint((a.address_data).lng, (a.address_data).lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography
    ) / 1000 as distance_km
FROM crm.addresses a
WHERE (a.address_data).lng IS NOT NULL
AND ST_DWithin(
    ST_SetSRID(ST_MakePoint((a.address_data).lng, (a.address_data).lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography,
    50000  -- 50km radius
)
ORDER BY distance_km
LIMIT 10;
```

## Performance Benchmarks

Expected performance on a modern development machine:

| Operation | Simple | Medium | Complex |
|-----------|--------|--------|---------|
| Database Creation | 2-5 sec | 30-60 sec | 5-10 min |
| Simple SELECT | < 10 ms | < 50 ms | < 100 ms |
| JOIN (2 tables) | < 20 ms | < 200 ms | < 500 ms |
| Complex Query | < 50 ms | < 1 sec | < 5 sec |
| COUNT(*) on main table | < 10 ms | < 100 ms | < 1 sec |
| Full-text search | N/A | N/A | < 500 ms |
| Partition pruning | N/A | N/A | < 100 ms |

## Testing Guidelines

### Unit Testing
Use the **simple** database for:
- Fast test execution
- Isolated component testing
- CI/CD pipelines

```bash
# In CI/CD
make simple-create
pytest tests/unit -v
make simple-drop
```

### Integration Testing
Use the **medium** database for:
- Multi-component testing
- Schema discovery features
- JOIN performance
- View testing

```bash
make medium-create
pytest tests/integration -v
make medium-drop
```

### Performance Testing
Use the **complex** database for:
- Query optimization
- Partition testing
- Large dataset operations
- Stress testing

```bash
make complex-create
pytest tests/benchmark -v
make complex-drop
```

### Security Testing
All databases include:
- Various data types
- Different constraint types
- Complex relationships
- Potential SQL injection patterns in data

Use for testing:
- SQL validation
- Permission controls
- Injection prevention

## Troubleshooting

### Connection Issues
```bash
# Test PostgreSQL connection
psql -h localhost -U postgres -c "SELECT version();"

# Check if databases exist
psql -l | grep test
```

### Permission Denied
```bash
# Ensure PostgreSQL user has createdb permission
psql -U postgres -c "ALTER USER postgres CREATEDB;"
```

### Database Already Exists
```bash
# Use recreate to drop and recreate
make simple-recreate

# Or manually drop
dropdb simple_test
```

### Performance Issues with Complex Database
```bash
# Increase PostgreSQL resources for complex DB
# Edit postgresql.conf:
# - shared_buffers = 2GB
# - work_mem = 100MB
# - maintenance_work_mem = 512MB
```

## Extending the Test Databases

### Adding Custom Data
```sql
-- Add custom test data to simple_test
INSERT INTO store.customers (first_name, last_name, email, phone)
VALUES ('Test', 'User', 'test@example.com', '555-1234');
```

### Creating Custom Views
```sql
-- Add custom views for specific test cases
CREATE VIEW test_specific_view AS
SELECT * FROM store.customers WHERE email LIKE '%test%';
```

### Modifying Data Volume
Edit the SQL files and adjust the `generate_series()` ranges:
```sql
-- Change from 200 to 500 customers
FROM generate_series(1, 500) i;  -- instead of 200
```

## Maintenance

### Refreshing Materialized Views
```sql
-- Medium database
REFRESH MATERIALIZED VIEW sales.monthly_sales_summary;
REFRESH MATERIALIZED VIEW inventory.product_stock_status;

-- Complex database (automatically refreshed during creation)
```

### Reindexing
```sql
-- If indexes become bloated
REINDEX DATABASE medium_test;
```

### Vacuuming
```sql
-- Reclaim disk space
VACUUM FULL ANALYZE;
```

## Contributing

When adding new test databases:
1. Create new SQL file with clear naming convention
2. Add corresponding make target
3. Document schema in this README
4. Include verification queries
5. Add performance expectations
6. Test creation and deletion

## License

These test databases are provided as-is for testing purposes.
