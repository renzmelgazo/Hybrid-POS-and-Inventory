/**
 * FIFO Engine — Core FIFO Cost Lot Consumption Logic
 * 
 * Consumes oldest available lots first (by receive_date ASC, id ASC).
 * Returns the total COGS for the consumed quantity.
 */

const database = require('./database');

/**
 * Consume FIFO lots for a given item. Uses the oldest lots first.
 * @param {object} clientOrDb - database client (transaction) or pool
 * @param {number} itemId - the item being sold/consumed
 * @param {number} quantity - how many units to consume
 * @param {string} saleReference - reference string (e.g. "Sale #123", "INV-00001")
 * @returns {number} totalCOGS - the total cost of goods sold for this consumption
 */
async function consumeFIFO(clientOrDb, itemId, quantity, saleReference) {
    if (!itemId || quantity <= 0) return 0;
    
    let totalCOGS = 0;
    let remaining = quantity;

    try {
        // Get available lots in FIFO order (oldest first)
        const lotsResult = await clientOrDb.query(
            `SELECT id, remaining_qty, unit_cost 
             FROM fifo_cost_lots 
             WHERE item_id = $1 AND remaining_qty > 0 
             ORDER BY receive_date ASC, id ASC`,
            [itemId]
        );

        for (const lot of lotsResult.rows) {
            if (remaining <= 0) break;

            const availableQty = parseFloat(lot.remaining_qty);
            const consume = Math.min(remaining, availableQty);
            const lotCost = parseFloat(lot.unit_cost) || 0;
            const consumptionCost = consume * lotCost;

            // Reduce the lot's remaining quantity
            await clientOrDb.query(
                'UPDATE fifo_cost_lots SET remaining_qty = remaining_qty - $1 WHERE id = $2',
                [consume, lot.id]
            );

            // Log the consumption for audit trail
            await clientOrDb.query(
                `INSERT INTO fifo_consumption_log (lot_id, item_id, consumed_qty, unit_cost, total_cost, sale_reference)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [lot.id, itemId, consume, lotCost, consumptionCost, saleReference || '']
            );

            totalCOGS += consumptionCost;
            remaining -= consume;
        }
    } catch (err) {
        console.error('FIFO consumption error:', err.message);
    }

    return totalCOGS;
}

/**
 * Get the current FIFO-weighted average cost for an item
 * (sum of lot values / sum of remaining quantities)
 */
async function getFIFORate(db, itemId) {
    try {
        const result = await db.query(
            `SELECT 
                COALESCE(SUM(remaining_qty), 0) AS total_qty,
                COALESCE(SUM(remaining_qty * unit_cost), 0) AS total_value
             FROM fifo_cost_lots 
             WHERE item_id = $1 AND remaining_qty > 0`,
            [itemId]
        );
        const totalQty = parseFloat(result.rows[0].total_qty) || 0;
        const totalValue = parseFloat(result.rows[0].total_value) || 0;
        return totalQty > 0 ? totalValue / totalQty : 0;
    } catch (err) {
        return 0;
    }
}

/**
 * Get total FIFO asset value for an item (sum of all remaining lots)
 */
async function getFIFOAssetValue(db, itemId) {
    try {
        const result = await db.query(
            `SELECT COALESCE(SUM(remaining_qty * unit_cost), 0) AS asset_value
             FROM fifo_cost_lots 
             WHERE item_id = $1 AND remaining_qty > 0`,
            [itemId]
        );
        return parseFloat(result.rows[0].asset_value) || 0;
    } catch (err) {
        return 0;
    }
}

module.exports = {
    consumeFIFO,
    getFIFORate,
    getFIFOAssetValue
};
