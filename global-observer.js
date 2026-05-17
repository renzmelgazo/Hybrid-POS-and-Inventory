const EventEmitter = require('events');
const sysLogger = require('./system-logger');
const database = require('./database');

/**
 * Global Observer — Data Synchronization and History Engine
 * 
 * Ensures that every manual and system action is captured 
 * and correctly reflected across all report categories.
 */
class GlobalObserver extends EventEmitter {
    constructor() {
        super();
        this.init();
    }

    init() {
        // --- 1. SALES MODULE OBSERVERS ---
        this.on('sales-order:created', async (data) => {
            const { order, items, user } = data;
            await this.logActivity('Sales Order', order.id, order.order_number, 'Created', `User created Sales Order ${order.order_number} for customer ${order.customer_name}`, user);
            // Report categories: Sales by Item, Sales by Customer, Salesman Commission are updated via SQL on the tables.
        });

        this.on('sales-order:updated', async (data) => {
            const { order, items, user } = data;
            await this.logActivity('Sales Order', order.id, order.order_number, 'Updated', `User modified Sales Order ${order.order_number}`, user);
        });

        this.on('sales-order:voided', async (data) => {
            const { order, user } = data;
            await this.logActivity('Sales Order', order.id, order.order_number, 'Voided', `User voided Sales Order ${order.order_number}`, user);
        });

        this.on('sales-order:deleted', async (data) => {
            const { orderId, orderNumber, user } = data;
            // Historical footprint remains in logs even if record is gone
            await this.logActivity('Sales Order', orderId, orderNumber, 'Deleted', `User permanently deleted Sales Order ${orderNumber}`, user);
        });

        // --- 2. INVENTORY MODULE OBSERVERS ---
        this.on('purchase-receive:created', async (data) => {
            const { receive, items, user } = data;
            await this.logActivity('Purchase Receive', receive.id, receive.receive_number, 'Created', `Purchase Receive ${receive.receive_number} recorded for PO #${receive.purchase_id}`, user);
            
            // Automation log for PO status changes triggered by receiving
            if (receive.poStatusChange) {
                await this.logAutomation('Purchase Order', receive.poNumber, receive.oldStatus, receive.newStatus, 'System');
            }
        });

        this.on('inventory:adjusted', async (data) => {
            const { adjustment, items, user } = data;
            await this.logActivity('Inventory Adjustment', adjustment.id, adjustment.reference_number, 'Manual Adjustment', `Stock adjusted via ${adjustment.reason}: ${adjustment.description}`, user);
        });

        // --- 3. FINANCIAL MODULE OBSERVERS ---
        this.on('payment-received:created', async (data) => {
            const { payment, user } = data;
            await this.logActivity('Payment Received', payment.id, payment.payment_number, 'Created', `Payment of ${payment.amount_received} received from ${payment.customer_name}`, user);
        });

        this.on('payment-received:updated', async (data) => {
            const { payment, user } = data;
            await this.logActivity('Payment Received', payment.id, payment.payment_number, 'Updated', `Payment of ${payment.amount_received} updated for ${payment.customer_name}`, user);
        });

        this.on('payment-received:voided', async (data) => {
            const { payment, user } = data;
            await this.logActivity('Payment Received', payment.id, payment.payment_number, 'Voided', `Payment of ${payment.amount_received} VOIDED`, user);
        });

        this.on('payment-made:created', async (data) => {
            const { payment, user } = data;
            await this.logActivity('Payment Made', payment.id, payment.payment_number, 'Created', `Payment of ${payment.amount_paid} made to ${payment.supplier_name}`, user);
        });

        this.on('payment-made:updated', async (data) => {
            const { payment, user } = data;
            await this.logActivity('Payment Made', payment.id, payment.payment_number, 'Updated', `Payment of ${payment.amount_paid} updated for ${payment.supplier_name}`, user);
        });

        this.on('payment-made:voided', async (data) => {
            const { payment, user } = data;
            await this.logActivity('Payment Made', payment.id, payment.payment_number, 'Voided', `Payment of ${payment.amount_paid} VOIDED`, user);
        });

        // --- 4. LOGGING ENGINE (AUTOMATION & STATUS CHANGES) ---
        this.on('status:changed', async (data) => {
            const { module, reference, oldStatus, newStatus, user, isSystem } = data;
            if (isSystem) {
                await this.logAutomation(module, reference, oldStatus, newStatus, user);
            } else {
                await this.logActivity(module, null, reference, 'Status Change', `Status changed from "${oldStatus}" to "${newStatus}"`, user);
            }
        });
    }

    /**
     * Captures system-automated status changes into Automation Logs
     */
    async logAutomation(module, reference, oldStatus, newStatus, user) {
        await sysLogger.logStatusChange(module, reference, oldStatus, newStatus, user || 'System');
    }

    /**
     * Captures manual user modifications into Activity Logs
     */
    async logActivity(entityType, entityId, entityName, action, description, user) {
        try {
            const pool = database.getDb();
            await pool.query(
                `INSERT INTO activity_log (entity_type, entity_id, entity_name, action, description, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [entityType, entityId || null, entityName || null, action, description, user || 'System']
            );
        } catch (err) {
            console.error('[GlobalObserver] Failed to write activity log:', err.message);
        }
    }

    /**
     * Centralized trigger function to be used across routes
     * @param {string} event 
     * @param {object} data 
     */
    trigger(event, data) {
        this.emit(event, data);
    }
}

// Export singleton instance
const observer = new GlobalObserver();
module.exports = observer;
