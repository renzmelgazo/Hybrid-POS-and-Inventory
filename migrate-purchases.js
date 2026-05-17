/**
 * Migration: Add missing columns to purchases and purchase_items tables
 * Run: node server/migrate-purchases.js
 * Safe to re-run (uses IF NOT EXISTS)
 */
const database = require('./database');

async function migrate() {
    try {
        await database.init();
        const db = database.getDb();

        console.log('🔄 Running purchases migration...\n');

        // ===== PURCHASES TABLE =====
        const purchaseColumns = [
            { name: 'delivery_address', sql: 'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS delivery_address TEXT' },
            { name: 'reference_number', sql: 'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100)' },
            { name: 'discount_percent', sql: 'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(10,2) DEFAULT 0' },
            { name: 'adjustment', sql: 'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS adjustment NUMERIC(12,2) DEFAULT 0' },
            { name: 'terms_conditions', sql: 'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS terms_conditions TEXT' },
            { name: 'shipment_preference', sql: 'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS shipment_preference VARCHAR(255)' },
        ];

        for (const col of purchaseColumns) {
            await db.query(col.sql);
            console.log(`  ✅ purchases.${col.name}`);
        }

        // ===== PURCHASE_ITEMS TABLE =====
        const itemColumns = [
            { name: 'item_name', sql: 'ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS item_name VARCHAR(255)' },
            { name: 'selling_price', sql: 'ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2)' },
            { name: 'is_new', sql: 'ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE' },
        ];

        for (const col of itemColumns) {
            await db.query(col.sql);
            console.log(`  ✅ purchase_items.${col.name}`);
        }

        console.log('\n🎉 Migration complete! All columns are now available.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
