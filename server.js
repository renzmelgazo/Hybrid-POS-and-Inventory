const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const database = require('./database');
const sysLogger = require('./system-logger');

const app = express();
const PORT = 4001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Initialize database
database.init().then(() => {
  console.log('Database initialized successfully');
}).catch(err => {
  console.error('Database initialization error:', err);
});

// Auto Activity Logging Middleware
const entityMap = {
  '/api/items': 'item',
  '/api/purchases': 'purchase_order',
  '/api/bills': 'bill',
  '/api/suppliers': 'vendor',
  '/api/sales': 'sale',
  '/api/sales-orders': 'sales_order',
  '/api/invoices': 'invoice',
  '/api/sales-receipts': 'sales_receipt',
  '/api/inventory': 'inventory',
  '/api/purchase-receives': 'purchase_receive',
  '/api/packages': 'package',
  '/api/shipments': 'shipment',
  '/api/vendor-credits': 'vendor_credit',
  '/api/payments-made': 'payment_made',
  '/api/payments-received': 'payment_received',
  '/api/purchase-returns': 'purchase_return',
  '/api/locations': 'location'
};

// Human-readable module names for system_logs
const moduleNameMap = {
  item: 'Inventory', purchase_order: 'Purchases', bill: 'Bills',
  vendor: 'Vendors', sale: 'Sales', sales_order: 'Sales Orders',
  invoice: 'Invoices', sales_receipt: 'Sales Receipts',
  inventory: 'Inventory', purchase_receive: 'Purchase Receives',
  package: 'Packages', shipment: 'Shipments',
  vendor_credit: 'Vendor Credits', payment_made: 'Payments Made',
  payment_received: 'Payments Received', purchase_return: 'Purchase Returns',
  location: 'Locations'
};

app.use((req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE') return next();
  if (req.path.includes('/dashboard/')) return next();
  if (req.path.includes('/accept-quantities')) return next();
  if (req.path.includes('/activity-log')) return next();

  const originalJson = res.json.bind(res);
  res.json = function (data) {
    // Log activity after successful response
    if (res.statusCode < 400 && data && !data.error) {
      try {
        let entityType = null;
        for (const [prefix, type] of Object.entries(entityMap)) {
          if (req.originalUrl.startsWith(prefix)) { entityType = type; break; }
        }
        if (entityType) {
          const action = req.method === 'POST' ? 'created' : req.method === 'PUT' ? 'updated' : 'deleted';
          const entityName = data.name || data.po_number || data.bill_number || data.order_number || data.invoice_number || data.receipt_number || '';
          const entityId = data.id || req.params?.id || null;

          // Get the salesperson/user who made the action - check multiple fields
          const userName = req.body?.salesperson_name || data.salesperson_name
            || req.body?.salesperson || data.salesperson
            || req.body?.cashier_name || data.cashier_name
            || req.body?.supplier_name || data.supplier_name
            || req.body?.customer_name || data.customer_name
            || req.body?.vendor_name || data.vendor_name
            || req.body?.user_name || 'System';

          // Build description
          let desc = '';
          const typeLabel = entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          if (action === 'created') {
            desc = `${typeLabel} " ${entityName || entityId} " Added By ${userName}`;
          } else if (action === 'updated') {
            if (req.body?.status) {
              desc = `${typeLabel} " ${entityName || entityId} " status changed to ${req.body.status} By ${userName}`;
            } else if (req.body?.stock_quantity !== undefined) {
              desc = `${typeLabel} " ${entityName || entityId} " Stock Levels were updated By ${userName}`;
            } else {
              desc = `${typeLabel} " ${entityName || entityId} " Updated By ${userName}`;
            }
          } else {
            desc = `${typeLabel} " ${entityName || entityId} " Deleted By ${userName}`;
          }

          // ── Legacy activity_log write ──
          const db = database.getDb();
          db.query(
            `INSERT INTO activity_log (entity_type, entity_id, entity_name, action, description, user_name) VALUES ($1, $2, $3, $4, $5, $6)`,
            [entityType, entityId, entityName, action, desc, userName]
          ).catch(err => console.error('Activity log error:', err.message));

          // ── Structured system_logs write ──
          const moduleName = moduleNameMap[entityType] || typeLabel;
          const reference = entityName || (entityId ? `#${entityId}` : null);

          if (action === 'deleted') {
            sysLogger.logAudit('deleted', moduleName, reference, desc, userName);
          } else if (action === 'updated' && req.body?.status) {
            sysLogger.logStatusChange(moduleName, reference, '(previous)', req.body.status, userName);
          } else {
            sysLogger.logAudit(action, moduleName, reference, desc, userName);
          }

          // ── Low-stock check after inventory-affecting operations ──
          if ((entityType === 'sale' || entityType === 'item' || entityType === 'inventory') && entityId) {
            if (entityType === 'item') {
              sysLogger.checkLowStock(entityId);
            }
          }
        }
      } catch (e) { /* ignore logging errors */ }
    }
    return originalJson(data);
  };
  next();
});

// API Routes
app.use('/api/items', require('./routes/items'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/purchase-receives', require('./routes/purchase-receives'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/barcode', require('./routes/barcode'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/manufacturers', require('./routes/manufacturers'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/sales-orders', require('./routes/sales-orders'));
app.use('/api/salespersons', require('./routes/salespersons'));
app.use('/api/delivery-methods', require('./routes/delivery-methods'));
app.use('/api/shipment-preferences', require('./routes/shipment-preferences'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/sales-receipts', require('./routes/sales-receipts'));
app.use('/api/payments-received', require('./routes/payments-received'));
app.use('/api/payments-made', require('./routes/payments-made'));
app.use('/api/customer-credits', require('./routes/customer-credits'));
app.use('/api/vendor-credits', require('./routes/vendor-credits'));
app.use('/api/vendor-refunds', require('./routes/vendor-refunds'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/shipments', require('./routes/shipments'));
app.use('/api/sales-returns', require('./routes/sales-returns'));
app.use('/api/credit-notes', require('./routes/credit-notes'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/purchase-returns', require('./routes/purchase-returns'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/reports', require('./routes/report-data'));

// ====== URL-based Detail View Routes ======
// These catch-all routes serve the HTML pages for clean URLs
// so that a hard refresh on e.g. /purchases/po/PO-00050 doesn't 404

// Vendor detail: /vendors/:id
app.get('/vendors/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/vendor-detail.html'));
});

// Bill detail: /bills/:id
app.get('/bills/:id', (req, res) => {
  // Avoid conflicting with /api/bills routes (already handled above)
  res.sendFile(path.join(__dirname, '../public/bill-detail.html'));
});

// Purchase order detail: /purchases/po/:poNumber
app.get('/purchases/po/:poNumber', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/purchase-orders-by-vendor.html'));
});

// Taxes API (inline — simple CRUD)
app.get('/api/taxes', async (req, res) => {
  try {
    const db = require('./database').getDb();
    const result = await db.query('SELECT * FROM taxes WHERE is_active = true ORDER BY name');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n========================================');
  console.log('Inventory Management System Started!');
  console.log('========================================');
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`LAN access:   http://${localIP}:${PORT}`);
  console.log('========================================\n');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;

