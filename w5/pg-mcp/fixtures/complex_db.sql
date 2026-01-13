-- ============================================
-- Complex-Scale Test Database (complex)
-- 规模: 大量对象、超复杂关系、~1,000,000条数据
-- 包含: 分区表、复杂索引、触发器、存储过程、JSONB、数组、全文搜索
-- ============================================

-- 创建多个 schemas 按业务领域划分
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS ecommerce;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS warehouse;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS audit;

-- ============================================
-- 高级数据类型和扩展
-- ============================================

CREATE EXTENSION IF NOT EXISTS postgis;  -- 地理空间数据
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- 加密函数
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- 文本相似度搜索
CREATE EXTENSION IF NOT EXISTS hstore;    -- 键值存储

-- 自定义复合类型
CREATE TYPE ecommerce.inventory_status AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'discontinued', 'pre_order');
CREATE TYPE crm.customer_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond');
CREATE TYPE finance.transaction_type AS ENUM ('sale', 'refund', 'chargeback', 'adjustment', 'payout');
CREATE TYPE finance.payment_method AS ENUM ('credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer', 'cash');

-- 自定义复合类型
CREATE TYPE ecommerce.address_type AS (
    street_address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION
);

-- ============================================
-- CRM 模块 - 客户关系管理
-- ============================================

-- 客户主表（分区表）
CREATE TABLE crm.customers (
    customer_id BIGSERIAL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    tier crm.customer_tier DEFAULT 'bronze',
    lifetime_value NUMERIC(15, 2) DEFAULT 0,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP,
    preferences JSONB DEFAULT '{}',
    tags TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, registration_date)
) PARTITION BY RANGE (registration_date);

-- 创建客户表分区（按年份）
CREATE TABLE crm.customers_2022 PARTITION OF crm.customers
    FOR VALUES FROM ('2022-01-01') TO ('2023-01-01');
CREATE TABLE crm.customers_2023 PARTITION OF crm.customers
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
CREATE TABLE crm.customers_2024 PARTITION OF crm.customers
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE crm.customers_2025 PARTITION OF crm.customers
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- 客户地址表
CREATE TABLE crm.addresses (
    address_id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    address_name VARCHAR(100),
    address_data ecommerce.address_type NOT NULL,
    is_default BOOLEAN DEFAULT false,
    address_type VARCHAR(20) DEFAULT 'shipping',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id, created_at) REFERENCES crm.customers(customer_id, registration_date) DEFERRABLE
);

-- 客户互动历史
CREATE TABLE crm.interactions (
    interaction_id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    interaction_type VARCHAR(50) NOT NULL,  -- email, phone, chat, in_person
    interaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subject TEXT,
    notes TEXT,
    sentiment_score NUMERIC(3, 2),  -- -1 to 1
    created_by INTEGER,
    metadata JSONB DEFAULT '{}'
);

-- 客户生命周期事件（使用 TimescaleDB 风格分区）
CREATE TABLE crm.lifecycle_events (
    event_id BIGSERIAL,
    customer_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    event_data JSONB DEFAULT '{}',
    PRIMARY KEY (event_id, event_timestamp)
) PARTITION BY RANGE (event_timestamp);

CREATE TABLE crm.lifecycle_events_2024 PARTITION OF crm.lifecycle_events
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE crm.lifecycle_events_2025 PARTITION OF crm.lifecycle_events
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- ============================================
-- Ecommerce 模块 - 电商平台
-- ============================================

-- 品牌表
CREATE TABLE ecommerce.brands (
    brand_id SERIAL PRIMARY KEY,
    brand_name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    website VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 产品分类表（嵌套集合模型）
CREATE TABLE ecommerce.categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(255) NOT NULL UNIQUE,
    parent_category_id INTEGER REFERENCES ecommerce.categories(category_id),
    level INTEGER DEFAULT 0,
    path TEXT,  -- 类似 '1/2/3' 的路径
    attributes JSONB DEFAULT '{}',  -- 分类特定属性
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    seo_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 产品主表
CREATE TABLE ecommerce.products (
    product_id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(255) NOT NULL UNIQUE,
    brand_id INTEGER REFERENCES ecommerce.brands(brand_id),
    category_id INTEGER REFERENCES ecommerce.categories(category_id),
    product_name VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    description TEXT,
    short_description TEXT,
    specifications JSONB DEFAULT '{}',
    variants JSONB DEFAULT '[]',  -- 产品变体
    images JSONB DEFAULT '[]',
    videos JSONB DEFAULT '[]',
    tags TEXT[],
    search_vector tsvector,  -- 全文搜索
    base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
    cost_price NUMERIC(12, 2) CHECK (cost_price >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    weight DECIMAL(10, 2),
    dimensions JSONB DEFAULT '{}',  -- {length, width, height, unit}
    inventory_status ecommerce.inventory_status DEFAULT 'in_stock',
    stock_quantity INTEGER DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    reorder_point INTEGER DEFAULT 10,
    is_featured BOOLEAN DEFAULT false,
    is_new_arrival BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 产品价格历史（分区表）
CREATE TABLE ecommerce.price_history (
    history_id BIGSERIAL,
    product_id BIGINT NOT NULL,
    old_price NUMERIC(12, 2),
    new_price NUMERIC(12, 2),
    price_change_percent NUMERIC(5, 2),
    change_reason TEXT,
    changed_by INTEGER,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (history_id, changed_at)
) PARTITION BY RANGE (changed_at);

CREATE TABLE ecommerce.price_history_2024 PARTITION OF ecommerce.price_history
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE ecommerce.price_history_2025 PARTITION OF ecommerce.price_history
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- 产品评论表
CREATE TABLE ecommerce.reviews (
    review_id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES ecommerce.products(product_id),
    customer_id BIGINT NOT NULL,
    order_id BIGINT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    content TEXT NOT NULL,
    is_verified_purchase BOOLEAN DEFAULT false,
    helpful_votes INTEGER DEFAULT 0,
    total_votes INTEGER DEFAULT 0,
    images JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 购物车和愿望清单
CREATE TABLE ecommerce.wishlists (
    wishlist_id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL REFERENCES ecommerce.products(product_id),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Finance 模块 - 财务系统
-- ============================================

-- 支付网关配置
CREATE TABLE finance.payment_gateways (
    gateway_id SERIAL PRIMARY KEY,
    gateway_name VARCHAR(255) NOT NULL UNIQUE,
    gateway_type VARCHAR(100) NOT NULL,
    configuration JSONB NOT NULL,  -- API keys, endpoints
    is_active BOOLEAN DEFAULT true,
    processing_fee_percent NUMERIC(5, 3) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 交易主表（分区表）
CREATE TABLE finance.transactions (
    transaction_id BIGSERIAL,
    order_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    transaction_type finance.transaction_type NOT NULL,
    payment_method finance.payment_method NOT NULL,
    gateway_id INTEGER REFERENCES finance.payment_gateways(gateway_id),
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    gateway_transaction_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    risk_score INTEGER DEFAULT 0,
    billing_details JSONB DEFAULT '{}',
    processing_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    PRIMARY KEY (transaction_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE finance.transactions_2024 PARTITION OF finance.transactions
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE finance.transactions_2025 PARTITION OF finance.transactions
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- 退款记录
CREATE TABLE finance.refunds (
    refund_id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    refund_amount NUMERIC(12, 2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    processed_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- ============================================
-- 复杂索引策略
-- ============================================

-- CRM 模块索引
CREATE INDEX idx_customers_email_trgm ON crm.customers USING gin (email gin_trgm_ops);
CREATE INDEX idx_customers_phone ON crm.customers (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_tier ON crm.customers (tier) WHERE tier IN ('gold', 'platinum', 'diamond');
CREATE INDEX idx_customers_lifetime_value ON crm.customers (lifetime_value DESC) WHERE is_active = true;
CREATE INDEX idx_customers_preferences ON crm.customers USING gin (preferences);
CREATE INDEX idx_customers_tags ON crm.customers USING gin (tags);
CREATE INDEX idx_customers_last_activity ON crm.customers (last_activity DESC) WHERE last_activity IS NOT NULL;

-- 地址地理空间索引
CREATE INDEX idx_addresses_location ON crm.addresses USING gist (
    st_setsrid(st_makepoint((address_data).lng, (address_data).lat), 4326)::geography
) WHERE (address_data).lng IS NOT NULL AND (address_data).lat IS NOT NULL;

-- CRM Interactions 索引
CREATE INDEX idx_interactions_customer ON crm.interactions (customer_id, interaction_date DESC);
CREATE INDEX idx_interactions_type ON crm.interactions (interaction_type, interaction_date);
CREATE INDEX idx_interactions_sentiment ON crm.interactions (sentiment_score) WHERE sentiment_score IS NOT NULL;
CREATE INDEX idx_interactions_metadata ON crm.interactions USING gin (metadata);

-- Ecommerce 产品索引
CREATE INDEX idx_products_brand ON ecommerce.products (brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX idx_products_category ON ecommerce.products (category_id, is_active, inventory_status);
CREATE INDEX idx_products_price ON ecommerce.products (base_price DESC) WHERE is_active = true;
CREATE INDEX idx_products_inventory_status ON ecommerce.products (inventory_status) WHERE inventory_status != 'in_stock';
CREATE INDEX idx_products_tags ON ecommerce.products USING gin (tags);
CREATE INDEX idx_products_search_vector ON ecommerce.products USING gin (search_vector);
CREATE INDEX idx_products_is_featured ON ecommerce.products (is_featured) WHERE is_featured = true;
CREATE INDEX idx_products_created_at ON ecommerce.products (created_at DESC);

-- 部分索引示例（只索引评分4星以上的）
CREATE INDEX idx_reviews_high_rating ON ecommerce.reviews (product_id, created_at DESC)
    WHERE rating >= 4;

-- 复合表达式索引
CREATE INDEX idx_products_profit_margin ON ecommerce.products ((base_price - cost_price) / NULLIF(cost_price, 0));

-- Finance transactions 索引
CREATE INDEX idx_transactions_customer ON finance.transactions (customer_id, created_at DESC);
CREATE INDEX idx_transactions_order ON finance.transactions (order_id) WHERE transaction_type = 'sale';
CREATE INDEX idx_transactions_gateway ON finance.transactions (gateway_id, status, created_at);
CREATE INDEX idx_transactions_risk_score ON finance.transactions (risk_score DESC) WHERE risk_score > 50;
CREATE INDEX idx_transactions_amount ON finance.transactions (amount DESC) WHERE status = 'completed';

-- ============================================
-- 触发器和函数
-- ============================================

-- 自动更新 updated_at 的触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 产品表触发器
CREATE TRIGGER trigger_products_updated_at
    BEFORE UPDATE ON ecommerce.products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 客户生命周期事件触发器
CREATE OR REPLACE FUNCTION log_customer_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO crm.lifecycle_events (customer_id, event_type, event_data)
    VALUES (
        NEW.customer_id,
        CASE TG_OP
            WHEN 'INSERT' THEN 'customer_created'
            WHEN 'UPDATE' THEN 'customer_updated'
        END,
        jsonb_build_object('source', TG_TABLE_NAME, 'timestamp', CURRENT_TIMESTAMP)
    );
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_customer_lifecycle
    AFTER INSERT OR UPDATE ON crm.customers
    FOR EACH ROW
    EXECUTE FUNCTION log_customer_event();

-- 自动更新产品搜索向量
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector = to_tsvector(
        'english',
        COALESCE(NEW.product_name, '') || ' ' ||
        COALESCE(NEW.short_description, '') || ' ' ||
        COALESCE(NEW.description, '') || ' ' ||
        COALESCE(array_to_string(NEW.tags, ' '), '')
    );
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_products_search_vector
    BEFORE INSERT OR UPDATE OF product_name, short_description, description, tags ON ecommerce.products
    FOR EACH ROW
    EXECUTE FUNCTION update_product_search_vector();

-- 库存变动触发器
CREATE OR REPLACE FUNCTION update_inventory_on_order()
RETURNS TRIGGER AS $$
DECLARE
    current_stock INT;
BEGIN
    -- 检查库存
    SELECT stock_quantity INTO current_stock
    FROM ecommerce.products
    WHERE product_id = NEW.product_id;

    IF current_stock < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %', NEW.product_id;
    END IF;

    -- 减少库存
    UPDATE ecommerce.products
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE product_id = NEW.product_id;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- 存储过程和函数
-- ============================================

-- 客户价值计算函数
CREATE OR REPLACE FUNCTION calculate_customer_lifetime_value(p_customer_id BIGINT)
RETURNS NUMERIC(15, 2) AS $$
DECLARE
    total_value NUMERIC(15, 2);
BEGIN
    SELECT COALESCE(SUM(total_amount), 0)
    INTO total_value
    FROM finance.transactions
    WHERE customer_id = p_customer_id
    AND transaction_type = 'sale'
    AND status = 'completed';

    RETURN total_value;
END;
$$ language 'plpgsql';

-- 复杂报表生成函数
CREATE OR REPLACE FUNCTION get_sales_report(
    p_start_date DATE,
    p_end_date DATE,
    p_category_id INTEGER DEFAULT NULL,
    p_brand_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    report_date DATE,
    total_orders BIGINT,
    total_revenue NUMERIC,
    avg_order_value NUMERIC,
    unique_customers BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE(t.created_at) AS report_date,
        COUNT(DISTINCT t.order_id) AS total_orders,
        SUM(t.amount) AS total_revenue,
        AVG(t.amount) AS avg_order_value,
        COUNT(DISTINCT t.customer_id) AS unique_customers
    FROM finance.transactions t
    JOIN sales.orders o ON t.order_id = o.order_id
    JOIN sales.order_items oi ON o.order_id = oi.order_id
    JOIN ecommerce.products p ON oi.product_id = p.product_id
    WHERE t.created_at::DATE BETWEEN p_start_date AND p_end_date
    AND t.status = 'completed'
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
    GROUP BY DATE(t.created_at)
    ORDER BY report_date DESC;
END;
$$ language 'plpgsql';

-- 产品推荐函数（基于协同过滤）
CREATE OR REPLACE FUNCTION get_product_recommendations(p_product_id BIGINT, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (recommended_product_id BIGINT, score NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT
        oi2.product_id AS recommended_product_id,
        SUM(oi1.quantity * oi2.quantity)::NUMERIC AS score
    FROM sales.order_items oi1
    JOIN sales.order_items oi2 ON oi1.order_id = oi2.order_id
    WHERE oi1.product_id = p_product_id
    AND oi2.product_id != p_product_id
    GROUP BY oi2.product_id
    ORDER BY score DESC
    LIMIT p_limit;
END;
$$ language 'plpgsql';

-- ============================================
-- 生成大规模测试数据
-- ============================================

-- 生成品牌
INSERT INTO ecommerce.brands (brand_name, description, website, metadata)
SELECT
    'Brand ' || i,
    'Description for brand ' || i,
    'https://brand' || i || '.com',
    jsonb_build_object('founded_year', 2000 + (random() * 25)::integer, 'country', (ARRAY['USA', 'Germany', 'Japan', 'China', 'Korea'])[(random() * 4 + 1)::integer])
FROM generate_series(1, 200) i;

-- 生成分类树（3级深度）
INSERT INTO ecommerce.categories (category_name, parent_category_id, level, path, attributes)
VALUES
    -- 一级分类
    ('Electronics', NULL, 0, '1', '{}'),
    ('Clothing', NULL, 0, '2', '{}'),
    ('Home & Garden', NULL, 0, '3', '{}'),
    ('Sports & Outdoors', NULL, 0, '4', '{}'),
    ('Books & Media', NULL, 0, '5', '{}'),
    ('Toys & Games', NULL, 0, '6', '{}'),
    ('Automotive', NULL, 0, '7', '{}'),
    ('Health & Beauty', NULL, 0, '8', '{}');

-- 二级分类
INSERT INTO ecommerce.categories (category_name, parent_category_id, level, path, attributes)
SELECT
    'Subcategory ' || i,
    (random() * 7 + 1)::integer,
    1,
    path || '/' || i,
    jsonb_build_object('popular', random() > 0.5)
FROM (
    SELECT i, (random() * 7 + 1)::integer AS parent_id
    FROM generate_series(9, 50) i
) sub
JOIN ecommerce.categories c ON sub.parent_id = c.category_id;

-- 三级分类
INSERT INTO ecommerce.categories (category_name, parent_category_id, level, path, attributes)
SELECT
    'Leaf Category ' || i,
    (random() * 41 + 9)::integer,
    2,
    path || '/' || i,
    jsonb_build_object('filters', ARRAY['color', 'size', 'brand'])
FROM (
    SELECT i, (random() * 41 + 9)::integer AS parent_id
    FROM generate_series(51, 200) i
) sub
JOIN ecommerce.categories c ON sub.parent_id = c.category_id;

-- 生成50,000个产品
INSERT INTO ecommerce.products (
    sku, brand_id, category_id, product_name, slug, description,
    short_description, specifications, tags, base_price, cost_price,
    weight, dimensions, inventory_status, stock_quantity
)
SELECT
    'SKU-' || LPAD(i::text, 8, '0'),
    (random() * 199 + 1)::integer,
    (random() * 149 + 51)::integer,
    'Product ' || i || ' ' || substr(md5(random()::text), 1, 20),
    'product-' || i || '-' || substr(md5(random()::text), 1, 10),
    'Full description for product ' || i || '. ' || repeat('This is a detailed product description. ', 5),
    'Short description for product ' || i,
    jsonb_build_object(
        'color', (ARRAY['red', 'blue', 'green', 'black', 'white'])[(random() * 4 + 1)::integer],
        'size', (ARRAY['S', 'M', 'L', 'XL'])[(random() * 3 + 1)::integer],
        'material', (ARRAY['cotton', 'polyester', 'metal', 'plastic'])[(random() * 3 + 1)::integer]
    ),
    ARRAY['tag' || (random() * 20 + 1)::integer, 'tag' || (random() * 20 + 2)::integer],
    (random() * 990 + 10)::numeric(12, 2),
    (random() * 700 + 50)::numeric(12, 2),
    (random() * 50 + 0.5)::decimal(10, 2),
    jsonb_build_object('length', 10, 'width', 5, 'height', 2, 'unit', 'cm'),
    (ARRAY['in_stock', 'low_stock', 'out_of_stock', 'discontinued'])[(random() * 3 + 1)::integer],
    (random() * 1000)::integer
FROM generate_series(1, 50000) i;

-- 更新产品的搜索向量
UPDATE ecommerce.products SET search_vector = to_tsvector('english', product_name || ' ' || short_description);

-- 生成200个支付网关
INSERT INTO finance.payment_gateways (gateway_name, gateway_type, configuration, processing_fee_percent)
SELECT
    'Gateway ' || i,
    (ARRAY['stripe', 'paypal', 'square', 'braintree', 'adyen'])[(random() * 4 + 1)::integer],
    jsonb_build_object(
        'api_key', md5(random()::text),
        'webhook_secret', md5(random()::text),
        'environment', (ARRAY['sandbox', 'production'])[(random() + 1)::integer]
    ),
    (random() * 3 + 0.5)::numeric(5, 3)
FROM generate_series(1, 200) i;

-- 生成1000个客户
INSERT INTO crm.customers (email, phone, tier, lifetime_value, registration_date, preferences, tags)
SELECT
    'customer' || i || '@test.com',
    '555-' || LPAD((random() * 9999)::integer::text, 4, '0'),
    (ARRAY['bronze', 'silver', 'gold', 'platinum', 'diamond'])[(random() * 4 + 1)::integer],
    (random() * 10000)::numeric(15, 2),
    CURRENT_TIMESTAMP - ((random() * 730)::integer || ' days')::interval,
    jsonb_build_object(
        'marketing_opt_in', random() > 0.3,
        'preferred_category', (random() * 200 + 1)::integer,
        'newsletter_frequency', (ARRAY['daily', 'weekly', 'monthly'])[(random() * 2 + 1)::integer]
    ),
    ARRAY['segment_' || (random() * 10 + 1)::integer, 'channel_' || (random() * 5 + 1)::integer]
FROM generate_series(1, 1000) i;

-- 生成200万笔交易（按时间分布）
INSERT INTO finance.transactions (
    order_id, customer_id, transaction_type, payment_method, gateway_id,
    amount, currency, gateway_transaction_id, status, risk_score, billing_details
)
SELECT
    i,
    (random() * 999 + 1)::bigint,
    CASE WHEN random() > 0.05 THEN 'sale' ELSE (ARRAY['refund', 'chargeback'])[(random() * 1 + 1)::integer] END,
    (ARRAY['credit_card', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer'])[(random() * 4 + 1)::integer],
    (random() * 199 + 1)::integer,
    (random() * 990 + 10)::numeric(12, 2),
    'USD',
    'TXN-' || i || '-' || md5(random()::text),
    CASE WHEN random() > 0.1 THEN 'completed' ELSE (ARRAY['pending', 'failed'])[(random() * 1 + 1)::integer] END,
    (random() * 100)::integer,
    jsonb_build_object(
        'billing_address', jsonb_build_object('street', '123 Main St', 'city', 'New York', 'state', 'NY', 'zip', '10001'),
        'ip_address', '192.168.' || (random() * 255)::integer || '.' || (random() * 255)::integer
    )
FROM generate_series(1, 2000000) i;

-- 为已完成的事务设置 completed_at
UPDATE finance.transactions
SET completed_at = created_at + ((random() * 3600)::integer || ' seconds')::interval
WHERE status = 'completed';

-- ============================================
-- ANALYTICS 模块 - 分析数据
-- ============================================

-- 会话跟踪表
CREATE TABLE analytics.sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    customer_id BIGINT,
    device_type VARCHAR(20),
    browser VARCHAR(50),
    os VARCHAR(50),
    ip_address INET,
    geolocation JSONB,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    page_views INTEGER DEFAULT 0
);

-- 页面浏览事件
CREATE TABLE analytics.page_views (
    event_id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) REFERENCES analytics.sessions(session_id),
    customer_id BIGINT,
    page_url TEXT,
    referrer TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 再次刷新物化视图
-- ============================================

REFRESH MATERIALIZED VIEW sales.monthly_sales_summary;
REFRESH MATERIALIZED VIEW inventory.product_stock_status;

-- ============================================
-- 验证数据并创建总结统计
-- ============================================

CREATE VIEW analytics.database_stats AS
SELECT
    'crm.customers' AS table_name,
    COUNT(*) AS row_count,
    pg_size_pretty(pg_total_relation_size('crm.customers')) AS size
FROM crm.customers
UNION ALL
SELECT
    'ecommerce.products' AS table_name,
    COUNT(*) AS row_count,
    pg_size_pretty(pg_total_relation_size('ecommerce.products')) AS size
FROM ecommerce.products
UNION ALL
SELECT
    'finance.transactions' AS table_name,
    COUNT(*) AS row_count,
    pg_size_pretty(pg_total_relation_size('finance.transactions')) AS size
FROM finance.transactions;

SELECT * FROM analytics.database_stats;

-- 复杂查询示例
EXPLAIN ANALYZE
SELECT
    p.product_id,
    p.product_name,
    COUNT(DISTINCT t.customer_id) AS unique_customers,
    SUM(t.amount) AS total_revenue,
    AVG(t.amount) AS avg_transaction_value
FROM ecommerce.products p
JOIN sales.order_items oi ON p.product_id = oi.product_id
JOIN finance.transactions t ON t.order_id = oi.order_id
WHERE t.created_at >= CURRENT_DATE - INTERVAL '30 days'
AND t.status = 'completed'
GROUP BY p.product_id, p.product_name
HAVING SUM(t.amount) > 10000
ORDER BY total_revenue DESC
LIMIT 10;
