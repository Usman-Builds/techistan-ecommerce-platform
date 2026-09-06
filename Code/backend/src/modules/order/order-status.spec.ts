import { OrderStatus } from '@prisma/client';
import {
  ORDER_TRANSITIONS,
  canTransition,
  CUSTOMER_CANCELLABLE,
  RETURN_ELIGIBLE,
  buildTrackingUrl,
} from './order-status';

/**
 * Order lifecycle state machine (script 11, FR-501, NFR-208). Enforced
 * server-side; these specs pin the allowed edges and, crucially, that illegal
 * jumps (e.g. REFUNDED → SHIPPED) are rejected.
 */
describe('order status transitions', () => {
  it('permits the documented happy-path edges', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED)).toBe(true);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.PROCESSING)).toBe(true);
    expect(canTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).toBe(true);
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(true);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.COMPLETED)).toBe(true);
  });

  it('permits cancellation from open states only', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransition(OrderStatus.PROCESSING, OrderStatus.CANCELLED)).toBe(true);
    // Cannot cancel once shipped/delivered.
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.CANCELLED)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition(OrderStatus.REFUNDED, OrderStatus.SHIPPED)).toBe(false);
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.CONFIRMED)).toBe(false);
    expect(canTransition(OrderStatus.COMPLETED, OrderStatus.SHIPPED)).toBe(false);
    expect(canTransition(OrderStatus.PENDING, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.PENDING)).toBe(false);
  });

  it('treats COMPLETED, CANCELLED, and REFUNDED as terminal', () => {
    expect(ORDER_TRANSITIONS[OrderStatus.COMPLETED]).toEqual([]);
    expect(ORDER_TRANSITIONS[OrderStatus.CANCELLED]).toEqual([]);
    expect(ORDER_TRANSITIONS[OrderStatus.REFUNDED]).toEqual([]);
  });

  it('never lists a status as its own successor', () => {
    for (const [from, tos] of Object.entries(ORDER_TRANSITIONS)) {
      expect(tos).not.toContain(from);
    }
  });

  it('allows a customer self-cancel only while unpaid (PENDING)', () => {
    expect(CUSTOMER_CANCELLABLE).toEqual([OrderStatus.PENDING]);
  });

  it('allows returns only after the order is received', () => {
    expect(RETURN_ELIGIBLE).toEqual([
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ]);
  });
});

describe('buildTrackingUrl', () => {
  it('builds a carrier URL and escapes the tracking number', () => {
    expect(buildTrackingUrl('UPS', '1Z 999')).toBe(
      'https://www.ups.com/track?tracknum=1Z%20999',
    );
  });

  it('is case-insensitive on the carrier key', () => {
    expect(buildTrackingUrl('fedex', 'ABC')).toBe(
      'https://www.fedex.com/fedextrack/?trknbr=ABC',
    );
  });

  it('returns null for a carrier with no template (OTHER / unknown)', () => {
    expect(buildTrackingUrl('OTHER', 'ABC')).toBeNull();
    expect(buildTrackingUrl('CARRIER-PIGEON', 'ABC')).toBeNull();
  });
});
