import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { acceptOrder, advanceTrip, adminConfirmPayment, adminDecideSettlement, cancelMyOrder, createOrder, riderCancelSettlement, setPaymentMethod } from './orderApi';

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: 'test-order', error: null }); });
describe('guarded order actions', () => {
  it.each(['food', 'padali', 'pabili', 'ride'] as const)('creates %s through the guarded RPC', async serviceType => {
    await createOrder({ serviceType, pickupAddress: 'Pickup', dropoffAddress: 'Dropoff', pickupLat: 10.4456, pickupLng: 123.7016, dropoffLat: 10.46, dropoffLng: 123.71, notes: null, estimatedPrice: 60, details: { phone: '09170000001' } });
    expect(rpc).toHaveBeenCalledWith('create_order', expect.objectContaining({ p_service_type: serviceType, p_details: { phone: '09170000001' } }));
  });
  it.each(['gcash', 'maya'] as const)('sends a %s reference without setting paid', async method => {
    await setPaymentMethod('test-order', method, ' 1009 2345 6789 ');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_order_payment_method', { p_order_id: 'test-order', p_method: method, p_reference: '1009 2345 6789' });
  });
  it('discards the reference when switching to COD', async () => {
    await setPaymentMethod('test-order', 'cod', '1234');
    expect(rpc).toHaveBeenCalledWith('set_order_payment_method', { p_order_id: 'test-order', p_method: 'cod', p_reference: null });
  });
  it('uses atomic claim and sequential trip actions', async () => {
    await acceptOrder('test-order');
    await advanceTrip('test-order', 'arrived_pickup');
    await advanceTrip('test-order', 'picked_up');
    await advanceTrip('test-order', 'completed');
    expect(rpc.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ['accept_order', { p_order_id: 'test-order' }],
      ...['arrived_pickup', 'picked_up', 'completed'].map(stage => ['advance_trip', { p_order_id: 'test-order', p_next_stage: stage }]),
    ]);
  });
  it('uses guarded cancellation and owner decisions', async () => {
    await cancelMyOrder('test-order', 'changed_mind', 'Changed my mind', null);
    await riderCancelSettlement('test-request');
    await adminConfirmPayment('test-order', true);
    await adminDecideSettlement('test-request', false, 'Not received');
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['cancel_my_order','rider_cancel_settlement','admin_confirm_payment','admin_decide_settlement']);
  });
  it('surfaces a stale claim failure rather than claiming success', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Order is no longer available' } });
    await expect(acceptOrder('test-order')).rejects.toThrow('Order is no longer available');
  });
});