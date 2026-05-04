/**
 * One-time sync script: Synchronize historical Sales Order statuses
 * 
 * Usage:
 *   DRY RUN:  node scripts/sync-so-statuses.js
 *   EXECUTE:  node scripts/sync-so-statuses.js --execute
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'inventory_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123123123',
});

const execute = process.argv.includes('--execute');

async function run() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Sales Order Status Sync — ${execute ? '🔴 LIVE EXECUTION' : '🟡 DRY RUN'}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        // Fetch all sales orders
        const soResult = await pool.query('SELECT * FROM sales_orders ORDER BY id');
        const orders = soResult.rows;
        console.log(`Total Sales Orders found: ${orders.length}\n`);

        // Fetch all invoices (keyed by order_number)
        const invResult = await pool.query('SELECT id, order_number FROM invoices');
        const invoicesByOrderNum = {};
        invResult.rows.forEach(inv => {
            if (inv.order_number) invoicesByOrderNum[inv.order_number] = true;
        });

        // Fetch all packages (keyed by sales_order_id)
        const pkgResult = await pool.query('SELECT id, sales_order_id, status FROM packages');
        const packagesBySO = {};
        pkgResult.rows.forEach(pkg => {
            if (pkg.sales_order_id) {
                if (!packagesBySO[pkg.sales_order_id]) packagesBySO[pkg.sales_order_id] = [];
                packagesBySO[pkg.sales_order_id].push(pkg);
            }
        });

        // Fetch all items for stock check
        const itemsResult = await pool.query('SELECT id, stock_quantity FROM items');
        const itemStockMap = {};
        itemsResult.rows.forEach(item => {
            itemStockMap[item.id] = parseFloat(item.stock_quantity) || 0;
        });

        const changes = {
            closedToConfirmed: [],
            confirmedToClosed: [],
            onHoldToConfirmed: [],
        };

        for (const so of orders) {
            const currentStatus = (so.status || '').toUpperCase();
            const orderNumber = so.order_number;
            const hasInvoice = !!invoicesByOrderNum[orderNumber];
            const packages = packagesBySO[so.id] || [];
            const allShipped = packages.length > 0 && packages.every(p => {
                const s = (p.status || '').toUpperCase();
                return s === 'SHIPPED' || s === 'DELIVERED';
            });

            // Scenario A: CLOSED but not both invoiced AND shipped → revert to CONFIRMED
            if (currentStatus === 'CLOSED') {
                if (!hasInvoice || !allShipped) {
                    changes.closedToConfirmed.push({
                        id: so.id,
                        order_number: orderNumber,
                        reason: !hasInvoice && !allShipped ? 'No invoice + no shipment'
                            : !hasInvoice ? 'No invoice'
                                : 'Not fully shipped'
                    });
                }
            }

            // Scenario B: CONFIRMED but both fully shipped AND invoiced → should be CLOSED
            if (currentStatus === 'CONFIRMED') {
                if (hasInvoice && allShipped) {
                    changes.confirmedToClosed.push({
                        id: so.id,
                        order_number: orderNumber,
                    });
                }
            }

            // Scenario C: ON HOLD but stock has arrived → revert to CONFIRMED
            if (currentStatus === 'ON HOLD') {
                // Check if all items now have sufficient stock
                const soItemsResult = await pool.query(
                    'SELECT item_id, quantity FROM sales_order_items WHERE sales_order_id = $1',
                    [so.id]
                );
                const soItems = soItemsResult.rows;
                let allStockSufficient = true;
                for (const item of soItems) {
                    if (item.item_id) {
                        const stock = itemStockMap[item.item_id] || 0;
                        const ordered = parseFloat(item.quantity) || 0;
                        if (stock < ordered) {
                            allStockSufficient = false;
                            break;
                        }
                    }
                }
                if (allStockSufficient) {
                    changes.onHoldToConfirmed.push({
                        id: so.id,
                        order_number: orderNumber,
                    });
                }
            }
        }

        // Print results
        console.log('─'.repeat(60));
        console.log(`  Scenario A: CLOSED → CONFIRMED  (${changes.closedToConfirmed.length} orders)`);
        console.log('─'.repeat(60));
        if (changes.closedToConfirmed.length > 0) {
            changes.closedToConfirmed.forEach(o => {
                console.log(`    ${o.order_number} (ID: ${o.id}) — ${o.reason}`);
            });
        } else {
            console.log('    None');
        }

        console.log();
        console.log('─'.repeat(60));
        console.log(`  Scenario B: CONFIRMED → CLOSED  (${changes.confirmedToClosed.length} orders)`);
        console.log('─'.repeat(60));
        if (changes.confirmedToClosed.length > 0) {
            changes.confirmedToClosed.forEach(o => {
                console.log(`    ${o.order_number} (ID: ${o.id})`);
            });
        } else {
            console.log('    None');
        }

        console.log();
        console.log('─'.repeat(60));
        console.log(`  Scenario C: ON HOLD → CONFIRMED  (${changes.onHoldToConfirmed.length} orders)`);
        console.log('─'.repeat(60));
        if (changes.onHoldToConfirmed.length > 0) {
            changes.onHoldToConfirmed.forEach(o => {
                console.log(`    ${o.order_number} (ID: ${o.id})`);
            });
        } else {
            console.log('    None');
        }

        const totalChanges = changes.closedToConfirmed.length + changes.confirmedToClosed.length + changes.onHoldToConfirmed.length;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  TOTAL: ${totalChanges} orders will be updated`);
        console.log(`${'='.repeat(60)}\n`);

        // Execute if --execute flag is passed
        if (execute && totalChanges > 0) {
            console.log('🔴 Executing updates...\n');

            for (const o of changes.closedToConfirmed) {
                await pool.query('UPDATE sales_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['CONFIRMED', o.id]);
                console.log(`  ✅ ${o.order_number} → CONFIRMED`);
            }
            for (const o of changes.confirmedToClosed) {
                await pool.query('UPDATE sales_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['CLOSED', o.id]);
                console.log(`  ✅ ${o.order_number} → CLOSED`);
            }
            for (const o of changes.onHoldToConfirmed) {
                await pool.query('UPDATE sales_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['CONFIRMED', o.id]);
                console.log(`  ✅ ${o.order_number} → CONFIRMED`);
            }

            console.log(`\n✅ Done! ${totalChanges} orders updated.`);
        } else if (!execute && totalChanges > 0) {
            console.log('🟡 This was a DRY RUN. No changes were made.');
            console.log('   To execute, run: node scripts/sync-so-statuses.js --execute\n');
        } else {
            console.log('✅ All orders are already in sync. No changes needed.\n');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

run();
