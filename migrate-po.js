const db = require('./server/database');

async function migrate() {
    await db.init();
    const d = db.getDb();

    const columns = [
        'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS delivery_address TEXT',
        'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100)',
        'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(10,2) DEFAULT 0',
        'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS adjustment NUMERIC(10,2) DEFAULT 0',
        'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS terms_conditions TEXT',
        'ALTER TABLE purchases ADD COLUMN IF NOT EXISTS shipment_preference VARCHAR(100)'
    ];

    for (const sql of columns) {
        await d.query(sql);
        console.log('OK:', sql.split('ADD COLUMN IF NOT EXISTS ')[1]);
    }

    console.log('All columns added successfully');
    process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
