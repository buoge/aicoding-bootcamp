-- ============================================
-- Small-Scale Test Database (simple)
-- 规模: 少量表、简单关系、~1000条数据
-- ============================================

-- 创建 schema
CREATE SCHEMA IF NOT EXISTS store;

-- ============================================
-- 表结构
-- ============================================

-- 客户表
CREATE TABLE store.customers (
    customer_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 产品表
CREATE TABLE store.products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 订单表
CREATE TABLE store.orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES store.customers(customer_id),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- 订单详情表
CREATE TABLE store.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES store.orders(order_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES store.products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0)
);

-- ============================================
-- 索引
-- ============================================

CREATE INDEX idx_customers_email ON store.customers(email);
CREATE INDEX idx_customers_created_at ON store.customers(created_at);
CREATE INDEX idx_products_price ON store.products(price);
CREATE INDEX idx_products_stock ON store.products(stock_quantity);
CREATE INDEX idx_orders_customer_id ON store.orders(customer_id);
CREATE INDEX idx_orders_order_date ON store.orders(order_date);
CREATE INDEX idx_orders_status ON store.orders(status);
CREATE INDEX idx_order_items_order_id ON store.order_items(order_id);
CREATE INDEX idx_order_items_product_id ON store.order_items(product_id);

-- ============================================
-- 视图
-- ============================================

-- 客户订单统计视图
CREATE VIEW store.customer_order_stats AS
SELECT
    c.customer_id,
    c.first_name,
    c.last_name,
    COUNT(o.order_id) AS total_orders,
    SUM(o.total_amount) AS total_spent,
    AVG(o.total_amount) AS avg_order_value,
    MAX(o.order_date) AS last_order_date
FROM store.customers c
LEFT JOIN store.orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.first_name, c.last_name;

-- 产品销售统计视图
CREATE VIEW store.product_sales_stats AS
SELECT
    p.product_id,
    p.product_name,
    p.price,
    COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
    COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_revenue
FROM store.products p
LEFT JOIN store.order_items oi ON p.product_id = oi.product_id
GROUP BY p.product_id, p.product_name, p.price;

-- ============================================
-- 自定义类型
-- ============================================

CREATE TYPE store.order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');

-- ============================================
-- 生成测试数据
-- ============================================

-- 生成客户数据 (~200 客户)
INSERT INTO store.customers (first_name, last_name, email, phone)
SELECT
    'FN' || i,
    'LN' || i,
    'customer' || i || '@test.com',
    '555-' || LPAD(i::text, 4, '0')
FROM generate_series(1, 200) i;

-- 生成产品数据 (~50 产品)
INSERT INTO store.products (product_name, description, price, stock_quantity)
SELECT
    'Product ' || i,
    'Description for product ' || i,
    (random() * 990 + 10)::numeric(10, 2),
    (random() * 900 + 100)::integer
FROM generate_series(1, 50) i;

-- 生成订单数据 (~500 订单)
INSERT INTO store.orders (customer_id, order_date, status, total_amount)
SELECT
    (random() * 199 + 1)::integer,
    CURRENT_TIMESTAMP - (random() * 365 || ' days')::interval,
    (ARRAY['pending', 'processing', 'shipped', 'delivered', 'cancelled'])[(random() * 4 + 1)::integer],
    0
FROM generate_series(1, 500) i;

-- 生成订单详情数据 (~2000 订单项)
INSERT INTO store.order_items (order_id, product_id, quantity, unit_price)
SELECT
    (random() * 499 + 1)::integer,
    (random() * 49 + 1)::integer,
    (random() * 4 + 1)::integer,
    (random() * 990 + 10)::numeric(10, 2)
FROM generate_series(1, 2000) i;

-- 更新订单总金额
UPDATE store.orders o
SET total_amount = (
    SELECT SUM(oi.quantity * oi.unit_price)
    FROM store.order_items oi
    WHERE oi.order_id = o.order_id
);

-- 删除没有订单项的订单
DELETE FROM store.orders
WHERE order_id IN (
    SELECT o.order_id
    FROM store.orders o
    LEFT JOIN store.order_items oi ON o.order_id = oi.order_id
    WHERE oi.order_item_id IS NULL
);

-- ============================================
-- 验证数据
-- ============================================

-- 客户总数
SELECT 'Total customers: ' || COUNT(*) FROM store.customers;

-- 产品总数
SELECT 'Total products: ' || COUNT(*) FROM store.products;

-- 订单总数
SELECT 'Total orders: ' || COUNT(*) FROM store.orders;

-- 订单项总数
SELECT 'Total order items: ' || COUNT(*) FROM store.order_items;

-- 视图数据样本
SELECT * FROM store.customer_order_stats LIMIT 5;
SELECT * FROM store.product_sales_stats LIMIT 5;
