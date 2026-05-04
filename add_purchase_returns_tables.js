const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'inventory_db',
    user: 'postgres',
    password: '123123123',
});

(async () => {
    try {
        // Create purchase_returns table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_returns (
                id SERIAL PRIMARY KEY,
                prn_number VARCHAR(50) UNIQUE,
                return_date DATE DEFAULT CURRENT_DATE,
                vendor_name VARCHAR(255),
                purchase_order_id INTEGER,
                purchase_order_number VARCHAR(50),
                warehouse_location VARCHAR(255) DEFAULT 'Head Office',
                reason TEXT,
                status VARCHAR(50) DEFAULT 'DRAFT',
                return_status VARCHAR(50) DEFAULT 'Pending',
                credit_status VARCHAR(50) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ purchase_returns table created');

        // Create purchase_return_items table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_return_items (
                id SERIAL PRIMARY KEY,
                purchase_return_id INTEGER REFERENCES purchase_returns(id) ON DELETE CASCADE,
                item_name VARCHAR(255),
                item_id INTEGER,
                received_quantity NUMERIC DEFAULT 0,
                already_returned NUMERIC DEFAULT 0,
                return_quantity NUMERIC DEFAULT 0,
                rate NUMERIC DEFAULT 0,
                amount NUMERIC DEFAULT 0
            )
        `);
        console.log('✅ purchase_return_items table created');

        console.log('Done! Both tables created successfully.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
        process.exit(0);
    }
})();
