const { Pool } = require('pg');
const p = new Pool({ host: 'localhost', port: 5432, database: 'inventory_db', user: 'postgres', password: '123123123' });

async function check() {
    // List all tables
    const r = await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    console.log('=== All Tables ===');
    r.rows.forEach(x => console.log(' ', x.tablename));

    // Check for credit_notes specifically
    const cn = r.rows.find(x => x.tablename === 'credit_notes');
    if (!cn) {
        console.log('\n⚠️  credit_notes table is MISSING - creating it...');
        await p.query(`
      CREATE TABLE IF NOT EXISTS credit_notes (
        id SERIAL PRIMARY KEY,
        credit_note_number VARCHAR(50) UNIQUE,
        credit_note_date DATE DEFAULT CURRENT_DATE,
        customer_id INTEGER,
        customer_name VARCHAR(255),
        reference_number VARCHAR(100),
        status VARCHAR(50) DEFAULT 'DRAFT',
        sub_total NUMERIC(12,2) DEFAULT 0,
        discount NUMERIC(12,2) DEFAULT 0,
        total NUMERIC(12,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
        await p.query(`
      CREATE TABLE IF NOT EXISTS credit_note_items (
        id SERIAL PRIMARY KEY,
        credit_note_id INTEGER REFERENCES credit_notes(id) ON DELETE CASCADE,
        item_id INTEGER,
        item_name VARCHAR(255),
        description TEXT,
        quantity NUMERIC DEFAULT 1,
        rate NUMERIC(12,2) DEFAULT 0,
        amount NUMERIC(12,2) DEFAULT 0
      )
    `);
        console.log('✅ credit_notes + credit_note_items tables created!');
    } else {
        console.log('\n✅ credit_notes table exists');
    }

    process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
