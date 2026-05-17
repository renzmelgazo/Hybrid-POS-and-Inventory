/**
 * System Logger — Centralized logging engine for GiHon POS
 *
 * Writes structured log entries to the `system_logs` table.
 * Each log has a severity level (Info, Warning, Critical, Auth),
 * a module, an optional reference, a description, and a user.
 *
 * Usage:
 *   const logger = require('./system-logger');
 *   await logger.info('Sales', 'SO-00123', 'Sales Order created', 'chloe');
 *   await logger.auth('Sales', 'SO-00123', 'User chloe authorized Sales Order SO-00123', 'chloe');
 *   await logger.warn('Inventory', 'ITEM-42', 'Item "Widget" reached low stock reorder point', 'System');
 *   await logger.critical('System', null, 'Database backup failed: disk full', 'System');
 */

const database = require('./database');

const LOG_TYPES = ['Info', 'Warning', 'Critical', 'Auth'];

/**
 * Insert a log entry into system_logs.
 * Silently catches errors so logging never crashes the caller.
 */
async function log(logType, module, referenceId, description, userId) {
  try {
    const pool = database.getDb();
    await pool.query(
      `INSERT INTO system_logs (log_type, module, reference_id, description, user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [logType, module || 'System', referenceId || null, description, userId || 'System']
    );
  } catch (err) {
    // Never let logging failures propagate — just print to console
    console.error('[SystemLogger] Failed to write log:', err.message);
  }
}

// Convenience methods
const info     = (mod, ref, desc, user) => log('Info', mod, ref, desc, user);
const warn     = (mod, ref, desc, user) => log('Warning', mod, ref, desc, user);
const critical = (mod, ref, desc, user) => log('Critical', mod, ref, desc, user);
const auth     = (mod, ref, desc, user) => log('Auth', mod, ref, desc, user);

/**
 * Check if an item has hit its low-stock reorder point.
 * If so, generate a Warning log. Call after any stock reduction.
 *
 * @param {number} itemId
 */
async function checkLowStock(itemId) {
  try {
    const pool = database.getDb();
    const result = await pool.query(
      `SELECT id, name, sku, stock_quantity, reorder_point
       FROM items
       WHERE id = $1 AND status = 'active'
         AND stock_quantity <= reorder_point
         AND reorder_point > 0`,
      [itemId]
    );
    if (result.rows.length > 0) {
      const item = result.rows[0];
      await warn(
        'Inventory',
        item.sku || `ITEM-${item.id}`,
        `Item "${item.name}" reached low stock reorder point (Stock: ${item.stock_quantity}, Reorder Point: ${item.reorder_point})`,
        'System'
      );
    }
  } catch (err) {
    console.error('[SystemLogger] Low stock check error:', err.message);
  }
}

/**
 * Log a status change on any entity.
 *
 * @param {string} module      - e.g. 'Package', 'Sales Order'
 * @param {string} reference   - e.g. 'PKG-00012'
 * @param {string} oldStatus
 * @param {string} newStatus
 * @param {string} userName
 */
async function logStatusChange(module, reference, oldStatus, newStatus, userName) {
  if (oldStatus === newStatus) return;
  await info(
    module,
    reference,
    `Status changed from "${oldStatus}" to "${newStatus}"`,
    userName || 'System'
  );
}

/**
 * Log an authorization event (password verification).
 *
 * @param {string} userName
 * @param {string} transactionType - e.g. 'Sales Order'
 * @param {string} reference       - e.g. 'SO-00050'
 * @param {boolean} success
 */
async function logAuthorization(userName, transactionType, reference, success) {
  if (success) {
    await auth(
      transactionType || 'System',
      reference || null,
      `User "${userName}" authorized ${transactionType}${reference ? ' ' + reference : ''} via password verification`,
      userName
    );
  } else {
    await warn(
      transactionType || 'System',
      reference || null,
      `Failed authorization attempt by "${userName}" for ${transactionType}${reference ? ' ' + reference : ''}`,
      userName
    );
  }
}

/**
 * Log a record modification (create/update/delete) for audit trail.
 *
 * @param {string} action   - 'created' | 'updated' | 'deleted' | 'voided'
 * @param {string} module   - e.g. 'Sales Order', 'Bill'
 * @param {string} reference
 * @param {string} details  - human-readable description
 * @param {string} userName
 */
async function logAudit(action, module, reference, details, userName) {
  const logType = (action === 'deleted' || action === 'voided') ? 'Warning' : 'Info';
  await log(logType, module, reference, details, userName || 'System');
}

module.exports = {
  log,
  info,
  warn,
  critical,
  auth,
  checkLowStock,
  logStatusChange,
  logAuthorization,
  logAudit,
  LOG_TYPES
};
