/**
 * Cleanup job for stale pending_payment orders.
 * 
 * Finds orders in pending_payment status older than 1 hour,
 * releases their stock reservations, and marks them as expired.
 * 
 * Run via cron: node jobs/cleanup-stale-orders.js
 * Recommended schedule: Every 15 minutes
 * 
 * Example crontab entry:
 *   0,15,30,45 * * * * cd /path/to/glovecubs && node jobs/cleanup-stale-orders.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dataService = require('../services/dataService');
const inventory = require('../lib/inventory');
const paymentLog = require('../lib/payment-logger');

const STALE_THRESHOLD_MINUTES = 60; // Orders older than 1 hour

async function cleanupStaleOrders() {
    console.log(`[cleanup] Starting stale order cleanup at ${new Date().toISOString()}`);
    
    try {
        const staleOrders = await dataService.getStalePendingPaymentOrders(STALE_THRESHOLD_MINUTES);
        
        if (staleOrders.length === 0) {
            console.log('[cleanup] No stale orders found');
            return { cleaned: 0 };
        }
        
        console.log(`[cleanup] Found ${staleOrders.length} stale order(s)`);
        
        let cleaned = 0;
        let errors = 0;
        
        for (const order of staleOrders) {
            try {
                console.log(`[cleanup] Processing order ${order.order_number} (ID: ${order.id}), created ${order.created_at}`);

                const full = await dataService.getOrderByIdAdmin(order.id);
                const needRelease =
                    full &&
                    full.inventory_reserved_at &&
                    !full.inventory_released_at &&
                    !full.inventory_deducted_at;
                if (needRelease) {
                    try {
                        await inventory.tryReleaseReservedStockForNonFulfillment(order.id);
                        paymentLog.inventoryReleased(order.id, 'stale_pending_payment_job');
                        console.log(`[cleanup] Released stock for order ${order.id}`);
                    } catch (releaseErr) {
                        paymentLog.logError('inventory.release_failed_stale_job', releaseErr, { order_id: order.id });
                        console.error(`[cleanup] Failed to release stock for order ${order.id}:`, releaseErr.message);
                        errors++;
                        continue;
                    }
                }

                await dataService.updateOrderStatus(order.id, 'expired');
                console.log(`[cleanup] Marked order ${order.id} as expired`);

                cleaned++;
            } catch (orderErr) {
                console.error(`[cleanup] Failed to cleanup order ${order.id}:`, orderErr.message);
                errors++;
            }
        }
        
        console.log(`[cleanup] Completed: ${cleaned} cleaned, ${errors} errors`);
        return { cleaned, errors, total: staleOrders.length };
        
    } catch (err) {
        console.error('[cleanup] Fatal error:', err.message);
        throw err;
    }
}

// Run if called directly
if (require.main === module) {
    cleanupStaleOrders()
        .then((result) => {
            console.log('[cleanup] Done:', result);
            process.exit(0);
        })
        .catch((err) => {
            console.error('[cleanup] Failed:', err);
            process.exit(1);
        });
}

module.exports = { cleanupStaleOrders, STALE_THRESHOLD_MINUTES };
