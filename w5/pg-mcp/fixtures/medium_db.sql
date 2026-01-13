-- ============================================
-- Medium-Scale Test Database (medium)
-- 规模: 中量表、复杂关系、~100,000条数据
-- 包含: 表、视图、物化视图、自定义类型、复杂索引
-- ============================================

-- 创建 schemas
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS hr;

-- ============================================
-- 自定义类型
-- ============================================

CREATE TYPE sales.order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'returned', 'cancelled');
CREATE TYPE hr.employee_level AS ENUM ('junior', 'mid', 'senior', 'lead', 'manager', 'director');
CREATE TYPE inventory.location_type AS ENUM ('warehouse', 'store', 'distribution_center');

-- ============================================
-- HR 模块 - 人力资源
-- ============================================

-- 部门表
CREATE TABLE hr.departments (
    department_id SERIAL PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL UNIQUE,
    manager_id INTEGER,
    budget NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 员工表
CREATE TABLE hr.employees (
    employee_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    department_id INTEGER NOT NULL REFERENCES hr.departments(department_id),
    level hr.employee_level NOT NULL DEFAULT 'junior',
    salary NUMERIC(10, 2) NOT NULL CHECK (salary > 0),
    hire_date DATE NOT NULL,
    birth_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 员工绩效表
CREATE TABLE hr.performance_reviews (
    review_id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES hr.employees(employee_id),
    review_period DATE NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 更新部门经理外键
ALTER TABLE hr.departments ADD CONSTRAINT fk_manager
    FOREIGN KEY (manager_id) REFERENCES hr.employees(employee_id);

-- ============================================
-- Inventory 模块 - 库存管理
-- ============================================

-- 供应商表
CREATE TABLE inventory.suppliers (
    supplier_id SERIAL PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL UNIQUE,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 产品分类表
CREATE TABLE inventory.categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    parent_category_id INTEGER REFERENCES inventory.categories(category_id),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 产品表
CREATE TABLE inventory.products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    category_id INTEGER REFERENCES inventory.categories(category_id),
    supplier_id INTEGER REFERENCES inventory.suppliers(supplier_id),
    sku VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    unit_cost NUMERIC(10, 2) NOT NULL CHECK (unit_cost >= 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    reorder_level INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 库存位置表
CREATE TABLE inventory.locations (
    location_id SERIAL PRIMARY KEY,
    location_name VARCHAR(100) NOT NULL,
    location_type inventory.location_type NOT NULL,
    address TEXT,
    is_active BOOLEAN DEFAULT true
);

-- 库存表
CREATE TABLE inventory.stock (
    stock_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    location_id INTEGER NOT NULL REFERENCES inventory.locations(location_id),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, location_id)
);

-- 库存移动记录表
CREATE TABLE inventory.stock_movements (
    movement_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    from_location_id INTEGER REFERENCES inventory.locations(location_id),
    to_location_id INTEGER REFERENCES inventory.locations(location_id),
    quantity INTEGER NOT NULL,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer')),
    reference_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Sales 模块 - 销售管理
-- ============================================

-- 客户表
CREATE TABLE sales.customers (
    customer_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 客户地址表
CREATE TABLE sales.customer_addresses (
    address_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES sales.customers(customer_id) ON DELETE CASCADE,
    address_type VARCHAR(20) DEFAULT 'shipping' CHECK (address_type IN ('shipping', 'billing')),
    street_address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 销售订单表
CREATE TABLE sales.orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES sales.customers(customer_id),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    required_date DATE,
    shipped_date DATE,
    status sales.order_status DEFAULT 'pending',
    shipping_address_id INTEGER REFERENCES sales.customer_addresses(address_id),
    subtotal NUMERIC(12, 2) DEFAULT 0,
    tax_amount NUMERIC(12, 2) DEFAULT 0,
    shipping_cost NUMERIC(10, 2) DEFAULT 0,
    total_amount NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 销售订单明细表
CREATE TABLE sales.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES sales.orders(order_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    discount_percent NUMERIC(5, 2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    line_total NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_price * (1 - discount_percent / 100)) STORED
);

-- 支付记录表
CREATE TABLE sales.payments (
    payment_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES sales.orders(order_id),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    transaction_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'completed'
);

-- ============================================
-- 索引
-- ============================================

-- HR 模块索引
CREATE INDEX idx_employees_department ON hr.employees(department_id);
CREATE INDEX idx_employees_level ON hr.employees(level);
CREATE INDEX idx_employees_hire_date ON hr.employees(hire_date);
CREATE INDEX idx_employees_salary ON hr.employees(salary);
CREATE INDEX idx_performance_employee ON hr.performance_reviews(employee_id, review_period);
CREATE INDEX idx_performance_rating ON hr.performance_reviews(rating);

-- Inventory 模块索引
CREATE INDEX idx_products_category ON inventory.products(category_id);
CREATE INDEX idx_products_supplier ON inventory.products(supplier_id);
CREATE INDEX idx_products_sku ON inventory.products(sku);
CREATE INDEX idx_products_active ON inventory.products(is_active);
CREATE INDEX idx_stock_product_location ON inventory.stock(product_id, location_id);
CREATE INDEX idx_stock_quantity ON inventory.stock(quantity);
CREATE INDEX idx_movements_product ON inventory.stock_movements(product_id, created_at);
CREATE INDEX idx_movements_type ON inventory.stock_movements(movement_type);
CREATE INDEX idx_categories_parent ON inventory.categories(parent_category_id);

-- Sales 模块索引
CREATE INDEX idx_customers_email ON sales.customers(email);
CREATE INDEX idx_customers_registration ON sales.customers(registration_date);
CREATE INDEX idx_addresses_customer ON sales.customer_addresses(customer_id);
CREATE INDEX idx_orders_customer ON sales.orders(customer_id, order_date);
CREATE INDEX idx_orders_date ON sales.orders(order_date);
CREATE INDEX idx_orders_status ON sales.orders(status);
CREATE INDEX idx_order_items_order ON sales.order_items(order_id);
CREATE INDEX idx_order_items_product ON sales.order_items(product_id);
CREATE INDEX idx_payments_order ON sales.payments(order_id);

-- ============================================
-- 视图
-- ============================================

-- 产品详细信息视图
CREATE VIEW inventory.product_details AS
SELECT
    p.product_id,
    p.product_name,
    p.sku,
    c.category_name,
    s.supplier_name,
    p.unit_price,
    p.unit_cost,
    p.reorder_level,
    SUM(st.quantity) AS total_stock
FROM inventory.products p
LEFT JOIN inventory.categories c ON p.category_id = c.category_id
LEFT JOIN inventory.suppliers s ON p.supplier_id = s.supplier_id
LEFT JOIN inventory.stock st ON p.product_id = st.product_id
WHERE p.is_active = true
GROUP BY p.product_id, p.product_name, p.sku, c.category_name, s.supplier_name, p.unit_price, p.unit_cost, p.reorder_level;

-- 员工详细信息视图
CREATE VIEW hr.employee_details AS
SELECT
    e.employee_id,
    e.first_name,
    e.last_name,
    e.email,
    d.department_name,
    e.level,
    e.salary,
    e.hire_date,
    e.is_active,
    AVG(pr.rating) AS avg_performance_rating,
    COUNT(DISTINCT pr.review_id) AS total_reviews
FROM hr.employees e
JOIN hr.departments d ON e.department_id = d.department_id
LEFT JOIN hr.performance_reviews pr ON e.employee_id = pr.employee_id
GROUP BY e.employee_id, e.first_name, e.last_name, e.email, d.department_name, e.level, e.salary, e.hire_date, e.is_active;

-- 客户订单统计视图
CREATE VIEW sales.customer_order_stats AS
SELECT
    c.customer_id,
    c.first_name,
    c.last_name,
    COUNT(DISTINCT o.order_id) AS total_orders,
    SUM(o.total_amount) AS total_spent,
    AVG(o.total_amount) AS avg_order_value,
    COUNT(DISTINCT oi.product_id) AS unique_products_purchased,
    MAX(o.order_date) AS last_order_date,
    MIN(o.order_date) AS first_order_date
FROM sales.customers c
LEFT JOIN sales.orders o ON c.customer_id = o.customer_id
LEFT JOIN sales.order_items oi ON o.order_id = oi.order_id
WHERE c.is_active = true
GROUP BY c.customer_id, c.first_name, c.last_name;

-- 高效销售报表视图
CREATE VIEW sales.sales_report AS
SELECT
    DATE_TRUNC('month', o.order_date) AS month,
    COUNT(DISTINCT o.order_id) AS total_orders,
    COUNT(DISTINCT o.customer_id) AS unique_customers,
    SUM(o.total_amount) AS total_revenue,
    SUM(o.tax_amount) AS total_tax,
    SUM(o.shipping_cost) AS total_shipping,
    AVG(o.total_amount) AS avg_order_value,
    SUM(oi.quantity) AS total_units_sold
FROM sales.orders o
JOIN sales.order_items oi ON o.order_id = oi.order_id
WHERE o.status NOT IN ('cancelled')
GROUP BY DATE_TRUNC('month', o.order_date)
ORDER BY month DESC;

-- ============================================
-- 物化视图
-- ============================================

-- 月度销售汇总物化视图
CREATE MATERIALIZED VIEW sales.monthly_sales_summary AS
SELECT
    DATE_TRUNC('month', order_date) AS month,
    COUNT(*) AS order_count,
    SUM(total_amount) AS total_revenue,
    AVG(total_amount) AS avg_order_value
FROM sales.orders
WHERE status NOT IN ('cancelled')
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY month DESC;

CREATE UNIQUE INDEX ON sales.monthly_sales_summary(month);

-- 产品库存状态物化视图
CREATE MATERIALIZED VIEW inventory.product_stock_status AS
SELECT
    p.product_id,
    p.product_name,
    SUM(s.quantity) AS total_quantity,
    CASE
        WHEN SUM(s.quantity) = 0 THEN 'out_of_stock'
        WHEN SUM(s.quantity) < p.reorder_level THEN 'low_stock'
        ELSE 'in_stock'
    END AS stock_status
FROM inventory.products p
LEFT JOIN inventory.stock s ON p.product_id = s.product_id
WHERE p.is_active = true
GROUP BY p.product_id, p.product_name, p.reorder_level;

CREATE UNIQUE INDEX ON inventory.product_stock_status(product_id);

-- ============================================
-- 生成测试数据
-- ============================================

-- 生成部门数据
INSERT INTO hr.departments (department_name, budget)
SELECT
    'Department ' || i,
    (random() * 900000 + 100000)::numeric(15, 2)
FROM generate_series(1, 10) i;

-- 生成50个供应商
INSERT INTO inventory.suppliers (supplier_name, contact_email, contact_phone, address)
SELECT
    'Supplier ' || i,
    'contact' || i || '@supplier.com',
    '555-' || LPAD(i::text, 4, '0'),
    'Address ' || i || ', Supplier City'
FROM generate_series(1, 50) i;

-- 生成分类数据（父子分类）
INSERT INTO inventory.categories (category_name, parent_category_id, description)
VALUES
    ('Electronics', NULL, 'Electronic devices and accessories'),
    ('Computers', 1, 'Computers and laptops'),
    ('Smartphones', 1, 'Mobile phones'),
    ('Clothing', NULL, 'Apparel and accessories'),
    ('Men', 4, 'Men clothing'),
    ('Women', 4, 'Women clothing'),
    ('Home & Garden', NULL, 'Home improvement and garden'),
    ('Books', NULL, 'Books and publications');

-- 生成500个产品
INSERT INTO inventory.products (product_name, category_id, supplier_id, sku, description, unit_cost, unit_price, reorder_level)
SELECT
    'Product ' || i,
    (random() * 7 + 1)::integer,
    (random() * 49 + 1)::integer,
    'SKU-' || LPAD(i::text, 6, '0'),
    'Description for product ' || i,
    (random() * 400 + 50)::numeric(10, 2),
    (random() * 800 + 100)::numeric(10, 2),
    (random() * 90 + 10)::integer
FROM generate_series(1, 500) i;

-- 生成库存位置
INSERT INTO inventory.locations (location_name, location_type, address)
VALUES
    ('Main Warehouse', 'warehouse', '1000 Warehouse Blvd'),
    ('Downtown Store', 'store', '200 Main Street'),
    ('Distribution Center North', 'distribution_center', '3000 North Road'),
    ('Distribution Center South', 'distribution_center', '4000 South Road'),
    ('Airport Store', 'store', '500 Airport Way');

-- 生成初始库存（每个产品-位置组合）
INSERT INTO inventory.stock (product_id, location_id, quantity)
SELECT
    p.product_id,
    l.location_id,
    (random() * 900 + 100)::integer
FROM inventory.products p
CROSS JOIN inventory.locations l
WHERE random() > 0.3  -- 30% 的产品不在某些位置
ON CONFLICT (product_id, location_id) DO NOTHING;

-- 生成1000名员工
INSERT INTO hr.employees (first_name, last_name, email, phone, department_id, level, salary, hire_date, birth_date)
SELECT
    'First' || i,
    'Last' || i,
    'employee' || i || '@company.com',
    '555-' || LPAD((i % 9999)::text, 4, '0'),
    (random() * 9 + 1)::integer,
    (ARRAY['junior', 'mid', 'senior', 'lead', 'manager', 'director'])[(random() * 5 + 1)::integer],
    (random() * 80000 + 40000)::numeric(10, 2),
    CURRENT_DATE - ((random() * 1825 + 365)::integer || ' days')::interval,
    CURRENT_DATE - ((random() * 14600 + 6570)::integer || ' days')::interval
FROM generate_series(1, 1000) i;

-- 更新部门经理
UPDATE hr.departments d
SET manager_id = (
    SELECT employee_id
    FROM hr.employees e
    WHERE e.department_id = d.department_id
    ORDER BY salary DESC, hire_date ASC
    LIMIT 1
);

-- 生成绩效评估（每名员工3-5次）
INSERT INTO hr.performance_reviews (employee_id, review_period, rating, notes)
SELECT
    e.employee_id,
    DATE_TRUNC('month', CURRENT_DATE - ((random() * 730 + 90)::integer || ' days')::interval),
    (random() * 4 + 1)::integer,
    'Performance review notes for employee ' || e.employee_id
FROM hr.employees e
CROSS JOIN generate_series(1, (random() * 3 + 2)::integer) s;

-- 生成10000名客户
INSERT INTO sales.customers (first_name, last_name, email, phone, registration_date)
SELECT
    'Customer' || i,
    'User' || i,
    'customer' || i || '@email.com',
    '555-' || LPAD((i % 9999)::text, 4, '0'),
    CURRENT_DATE - ((random() * 730)::integer || ' days')::interval
FROM generate_series(1, 10000) i;

-- 为客户生成地址（每人1-3个地址）
INSERT INTO sales.customer_addresses (customer_id, address_type, street_address, city, state, postal_code, is_default)
SELECT
    c.customer_id,
    CASE WHEN random() > 0.5 THEN 'shipping' ELSE 'billing' END,
    (random() * 9999 + 1)::integer || ' Test Street',
    (ARRAY['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia'])[(random() * 5 + 1)::integer],
    (ARRAY['NY', 'CA', 'IL', 'TX', 'AZ', 'PA'])[(random() * 5 + 1)::integer],
    LPAD((random() * 89999 + 10000)::integer::text, 5, '0'),
    false
FROM sales.customers c
CROSS JOIN generate_series(1, (random() * 2 + 1)::integer) s;

-- 生成25000个订单（最近2年）
INSERT INTO sales.orders (customer_id, order_date, required_date, shipped_date, status, shipping_address_id, subtotal, tax_amount, shipping_cost)
SELECT
    (random() * 9999 + 1)::integer,
    CURRENT_TIMESTAMP - ((random() * 730)::integer || ' days')::interval,
    CURRENT_DATE - ((random() * 700 - 30)::integer || ' days')::interval,
    CASE WHEN random() > 0.2
        THEN CURRENT_DATE - ((random() * 700)::integer || ' days')::interval
        ELSE NULL
    END,
    (ARRAY['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'returned', 'cancelled'])[(random() * 6 + 1)::integer],
    (SELECT address_id FROM sales.customer_addresses ca WHERE ca.customer_id = (random() * 9999 + 1)::integer ORDER BY random() LIMIT 1),
    0,
    0,
    (random() * 20 + 5)::numeric(10, 2)
FROM generate_series(1, 25000) i;

-- 生成100000个订单明细
INSERT INTO sales.order_items (order_id, product_id, quantity, unit_price, discount_percent)
SELECT
    (random() * 24999 + 1)::integer,
    (random() * 499 + 1)::integer,
    (random() * 9 + 1)::integer,
    (random() * 800 + 50)::numeric(10, 2),
    CASE WHEN random() > 0.9 THEN (random() * 25)::numeric(5, 2) ELSE 0 END
FROM generate_series(1, 100000) i;

-- 更新订单金额
UPDATE sales.orders o
SET
    subtotal = (SELECT SUM(line_total) FROM sales.order_items oi WHERE oi.order_id = o.order_id),
    tax_amount = (SELECT SUM(line_total) * 0.08 FROM sales.order_items oi WHERE oi.order_id = o.order_id);

UPDATE sales.orders o
SET total_amount = subtotal + tax_amount + shipping_cost;

-- 删除没有订单项的订单
DELETE FROM sales.orders
WHERE order_id IN (
    SELECT o.order_id
    FROM sales.orders o
    LEFT JOIN sales.order_items oi ON o.order_id = oi.order_id
    WHERE oi.order_item_id IS NULL
);

-- 生成支付记录
INSERT INTO sales.payments (order_id, payment_date, payment_method, amount, transaction_id)
SELECT
    o.order_id,
    o.order_date + ((random() * 7)::integer || ' days')::interval,
    (ARRAY['credit_card', 'paypal', 'bank_transfer', 'cash'])[(random() * 3 + 1)::integer],
    o.total_amount,
    'TXN-' || o.order_id || '-' || MD5(random()::text)
FROM sales.orders o
WHERE o.status NOT IN ('cancelled');

-- ============================================
-- 刷新物化视图
-- ============================================

REFRESH MATERIALIZED VIEW sales.monthly_sales_summary;
REFRESH MATERIALIZED VIEW inventory.product_stock_status;

-- ============================================
-- 验证数据
-- ============================================

SELECT '=== HR Module ===' AS module;
SELECT 'Departments: ' || COUNT(*) FROM hr.departments;
SELECT 'Employees: ' || COUNT(*) FROM hr.employees;
SELECT 'Performance Reviews: ' || COUNT(*) FROM hr.performance_reviews;

SELECT '=== Inventory Module ===' AS module;
SELECT 'Suppliers: ' || COUNT(*) FROM inventory.suppliers;
SELECT 'Categories: ' || COUNT(*) FROM inventory.categories;
SELECT 'Products: ' || COUNT(*) FROM inventory.products;
SELECT 'Locations: ' || COUNT(*) FROM inventory.locations;
SELECT 'Stock Records: ' || COUNT(*) FROM inventory.stock;
SELECT 'Stock Movements: ' || COUNT(*) FROM inventory.stock_movements;

SELECT '=== Sales Module ===' AS module;
SELECT 'Customers: ' || COUNT(*) FROM sales.customers;
SELECT 'Customer Addresses: ' || COUNT(*) FROM sales.customer_addresses;
SELECT 'Orders: ' || COUNT(*) FROM sales.orders;
SELECT 'Order Items: ' || COUNT(*) FROM sales.order_items;
SELECT 'Payments: ' || COUNT(*) FROM sales.payments;

SELECT '=== Sample Data ===' AS section;
SELECT * FROM hr.employee_details LIMIT 3;
SELECT * FROM inventory.product_details LIMIT 3;
SELECT * FROM sales.customer_order_stats LIMIT 3;
SELECT * FROM sales.sales_report LIMIT 3;
