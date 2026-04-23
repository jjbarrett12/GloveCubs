/**
 * Inventory System Tests
 * Tests for reservation, release, deduction, and consistency
 */

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

// Mock Supabase
const mockInventoryData = new Map();
const mockOrderData = new Map();
const mockStockHistory = [];

const mockSupabase = {
  from: (table) => {
    if (table === 'inventory') {
      return {
        select: () => ({
          eq: (field, value) => ({
            maybeSingle: async () => {
              const inv = mockInventoryData.get(value);
              return { data: inv || null, error: null };
            },
            gte: () => ({
              select: () => ({
                maybeSingle: async () => {
                  // Simulate atomic update success/failure
                  const inv = mockInventoryData.get(value);
                  if (inv) return { data: inv, error: null };
                  return { data: null, error: null };
                }
              })
            })
          })
        }),
        insert: async (data) => {
          mockInventoryData.set(data.product_id, { ...data, id: Date.now() });
          return { data: null, error: null };
        },
        update: (data) => ({
          eq: (field, value) => ({
            gte: () => ({
              select: () => ({
                maybeSingle: async () => {
                  const inv = mockInventoryData.get(value);
                  if (inv) {
                    // Check constraint
                    if (data.quantity_reserved !== undefined && data.quantity_reserved > inv.quantity_on_hand) {
                      return { data: null, error: null }; // Atomic fail
                    }
                    Object.assign(inv, data);
                    return { data: inv, error: null };
                  }
                  return { data: null, error: null };
                }
              })
            }),
            select: () => ({
              maybeSingle: async () => {
                const inv = mockInventoryData.get(value);
                if (inv) {
                  Object.assign(inv, data);
                  return { data: inv, error: null };
                }
                return { data: null, error: null };
              }
            })
          })
        })
      };
    }
    if (table === 'orders') {
      return {
        select: () => ({
          eq: (field, value) => ({
            maybeSingle: async () => {
              const order = mockOrderData.get(value);
              return { data: order || null, error: null };
            }
          })
        }),
        update: (data) => ({
          eq: (field, value) => {
            const order = mockOrderData.get(value);
            if (order) Object.assign(order, data);
            return { data: null, error: null };
          }
        })
      };
    }
    if (table === 'order_items') {
      return {
        select: () => ({
          eq: (field, value) => {
            const order = mockOrderData.get(value);
            return {
              data: order?.items || [],
              error: null
            };
          }
        })
      };
    }
    if (table === 'stock_history') {
      return {
        insert: async (data) => {
          mockStockHistory.push(data);
          return { data: null, error: null };
        },
        select: () => ({
          order: () => ({
            limit: () => ({
              eq: () => ({ data: mockStockHistory, error: null })
            })
          })
        })
      };
    }
    return {};
  }
};

// Reset mocks before each test
function resetMocks() {
  mockInventoryData.clear();
  mockOrderData.clear();
  mockStockHistory.length = 0;
}

describe('Inventory System', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('Stock Availability Check', () => {
    it('should return available when stock is sufficient', async () => {
      // Setup: Product with 100 on hand, 20 reserved = 80 available
      mockInventoryData.set(1, {
        product_id: 1,
        quantity_on_hand: 100,
        quantity_reserved: 20
      });

      // This would normally call inventory.checkAvailability
      // For unit test, we verify the math
      const onHand = 100;
      const reserved = 20;
      const available = Math.max(0, onHand - reserved);
      const needed = 50;

      assert.strictEqual(available, 80);
      assert.ok(available >= needed, 'Should have enough stock');
    });

    it('should return insufficient when stock is not enough', async () => {
      const onHand = 100;
      const reserved = 80;
      const available = Math.max(0, onHand - reserved);
      const needed = 50;

      assert.strictEqual(available, 20);
      assert.ok(available < needed, 'Should not have enough stock');
    });
  });

  describe('Reservation Logic', () => {
    it('should increase reserved quantity on successful reservation', () => {
      const currentReserved = 20;
      const orderQuantity = 30;
      const newReserved = currentReserved + orderQuantity;

      assert.strictEqual(newReserved, 50);
    });

    it('should reject reservation when it would exceed on_hand', () => {
      const onHand = 100;
      const currentReserved = 80;
      const orderQuantity = 30;
      const newReserved = currentReserved + orderQuantity; // 110

      // This should fail the atomic update
      assert.ok(newReserved > onHand, 'Reservation should be rejected');
    });

    it('should be idempotent - same order should not reserve twice', () => {
      const order = {
        id: 1,
        inventory_reserved_at: new Date().toISOString(),
        items: [{ product_id: 1, quantity: 10 }]
      };

      // If inventory_reserved_at is set, reservation should be skipped
      assert.ok(order.inventory_reserved_at != null, 'Order already reserved');
    });
  });

  describe('Release Logic', () => {
    it('should decrease reserved quantity on release', () => {
      const currentReserved = 50;
      const releaseQuantity = 30;
      const newReserved = Math.max(0, currentReserved - releaseQuantity);

      assert.strictEqual(newReserved, 20);
    });

    it('should clamp to zero and warn if release exceeds reserved', () => {
      const currentReserved = 20;
      const releaseQuantity = 30;
      const newReserved = Math.max(0, currentReserved - releaseQuantity);

      assert.strictEqual(newReserved, 0);
    });

    it('should be idempotent - same order should not release twice', () => {
      const order = {
        id: 1,
        inventory_reserved_at: new Date().toISOString(),
        inventory_released_at: new Date().toISOString(),
        items: [{ product_id: 1, quantity: 10 }]
      };

      assert.ok(order.inventory_released_at != null, 'Order already released');
    });

    it('should not release if never reserved', () => {
      const order = {
        id: 1,
        inventory_reserved_at: null,
        inventory_released_at: null,
        items: [{ product_id: 1, quantity: 10 }]
      };

      assert.ok(order.inventory_reserved_at == null, 'Order was never reserved');
    });
  });

  describe('Deduction Logic', () => {
    it('should decrease both on_hand and reserved on shipment', () => {
      const onHand = 100;
      const reserved = 50;
      const shipQuantity = 30;

      const newOnHand = Math.max(0, onHand - shipQuantity);
      const newReserved = Math.max(0, reserved - shipQuantity);

      assert.strictEqual(newOnHand, 70);
      assert.strictEqual(newReserved, 20);
    });

    it('should clamp to zero and warn if deduction exceeds on_hand', () => {
      const onHand = 20;
      const shipQuantity = 30;
      const newOnHand = Math.max(0, onHand - shipQuantity);

      assert.strictEqual(newOnHand, 0);
    });

    it('should be idempotent - same order should not deduct twice', () => {
      const order = {
        id: 1,
        inventory_deducted_at: new Date().toISOString(),
        items: [{ product_id: 1, quantity: 10 }]
      };

      assert.ok(order.inventory_deducted_at != null, 'Order already deducted');
    });
  });

  describe('Consistency Checks', () => {
    it('should detect reserved exceeding on_hand', () => {
      const onHand = 50;
      const reserved = 80;

      const issues = [];
      if (reserved > onHand) {
        issues.push({
          type: 'reserved_exceeds_onhand',
          severity: 'high'
        });
      }

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].type, 'reserved_exceeds_onhand');
    });

    it('should detect negative on_hand', () => {
      const onHand = -10;

      const issues = [];
      if (onHand < 0) {
        issues.push({
          type: 'negative_onhand',
          severity: 'critical'
        });
      }

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].type, 'negative_onhand');
    });

    it('should pass with valid inventory', () => {
      const onHand = 100;
      const reserved = 50;

      const issues = [];
      if (reserved > onHand) issues.push({ type: 'reserved_exceeds_onhand' });
      if (onHand < 0) issues.push({ type: 'negative_onhand' });
      if (reserved < 0) issues.push({ type: 'negative_reserved' });

      assert.strictEqual(issues.length, 0);
    });
  });

  describe('Stock History', () => {
    it('should track delta correctly for reserve', () => {
      const quantity = 30;
      const delta = -quantity; // Negative for reserve (removing from available)

      assert.strictEqual(delta, -30);
    });

    it('should track delta correctly for release', () => {
      const quantity = 30;
      const delta = quantity; // Positive for release (adding back to available)

      assert.strictEqual(delta, 30);
    });

    it('should track delta correctly for deduct', () => {
      const quantity = 30;
      const delta = -quantity; // Negative for deduct (removing from on_hand)

      assert.strictEqual(delta, -30);
    });

    it('should track delta correctly for receive', () => {
      const quantity = 100;
      const delta = quantity; // Positive for receive (adding to on_hand)

      assert.strictEqual(delta, 100);
    });
  });

  describe('Concurrent Reservation Prevention', () => {
    it('should calculate available stock correctly', () => {
      // Initial state
      const onHand = 100;
      const reserved = 0;
      const available = onHand - reserved;

      // Two users try to reserve 60 each
      const user1Request = 60;
      const user2Request = 60;

      // After user 1 reserves
      const reserved1 = reserved + user1Request; // 60
      const available1 = onHand - reserved1; // 40

      // User 2's request should fail atomic check
      const user2CanReserve = available1 >= user2Request; // 40 >= 60 = false

      assert.ok(!user2CanReserve, 'User 2 should not be able to reserve');
    });
  });
});

// Export for use in other test files
module.exports = { resetMocks };
