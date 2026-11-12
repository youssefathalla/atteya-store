import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canManageStore, roleFromClaim } from '../../lib/auth/require-role.js';
import {
  canDeleteOrderStatus,
  orderDeleteBlockedReason,
  readDocIdRequest,
} from '../../lib/orders/order-delete.js';
import { endsSession, isLastAdminRemoval, isTeamRole } from '../../lib/roles/team-roles.js';

describe('roleFromClaim', () => {
  it('reads admin and staff, anything else is a normal user', () => {
    assert.equal(roleFromClaim('admin'), 'admin');
    assert.equal(roleFromClaim('staff'), 'staff');
    assert.equal(roleFromClaim('Admin'), 'user');
    assert.equal(roleFromClaim(undefined), 'user');
    assert.equal(roleFromClaim(true), 'user');
  });
});

describe('canManageStore', () => {
  it('lets admin and staff into the dashboard only', () => {
    assert.equal(canManageStore('admin'), true);
    assert.equal(canManageStore('staff'), true);
    assert.equal(canManageStore('user'), false);
  });
});

describe('isTeamRole', () => {
  it('is admin or staff', () => {
    assert.equal(isTeamRole('admin'), true);
    assert.equal(isTeamRole('staff'), true);
    assert.equal(isTeamRole('user'), false);
  });
});

describe('isLastAdminRemoval', () => {
  it('refuses taking the last admin down to staff or no access', () => {
    assert.equal(isLastAdminRemoval('admin', 'staff', 0), true);
    assert.equal(isLastAdminRemoval('admin', 'user', 0), true);
  });
  it('allows it when another admin stays', () => {
    assert.equal(isLastAdminRemoval('admin', 'staff', 1), false);
  });
  it('never blocks changes to staff or normal accounts', () => {
    assert.equal(isLastAdminRemoval('staff', 'user', 0), false);
    assert.equal(isLastAdminRemoval('user', 'staff', 0), false);
  });
});

describe('endsSession', () => {
  it('ends the sign-in when access goes down', () => {
    assert.equal(endsSession('admin', 'staff'), true);
    assert.equal(endsSession('admin', 'user'), true);
    assert.equal(endsSession('staff', 'user'), true);
  });
  it('keeps it when access goes up', () => {
    assert.equal(endsSession('user', 'staff'), false);
    assert.equal(endsSession('staff', 'admin'), false);
  });
});

describe('orderDeleteBlockedReason', () => {
  it('allows Cancelled and Payment Failed orders only', () => {
    assert.equal(orderDeleteBlockedReason('cancelled'), null);
    assert.equal(orderDeleteBlockedReason('failed'), null);
    for (const status of ['pending', 'confirmed', 'shipped', 'delivered', undefined]) {
      assert.equal(canDeleteOrderStatus(status), false);
      assert.match(orderDeleteBlockedReason(status) ?? '', /Cancel the order first/);
    }
  });
});

describe('readDocIdRequest', () => {
  it('reads a document id', () => {
    assert.equal(readDocIdRequest({ orderId: 'abc123' }, 'orderId'), 'abc123');
    assert.equal(readDocIdRequest({ productId: 'eo-1' }, 'productId'), 'eo-1');
  });
  it('refuses anything that is not a plain id', () => {
    assert.equal(readDocIdRequest(null, 'orderId'), null);
    assert.equal(readDocIdRequest({ orderId: '' }, 'orderId'), null);
    assert.equal(readDocIdRequest({ orderId: 'a/b' }, 'orderId'), null);
    assert.equal(readDocIdRequest({ orderId: '..' }, 'orderId'), null);
    assert.equal(readDocIdRequest({ orderId: '__x__' }, 'orderId'), null);
    assert.equal(readDocIdRequest({ orderId: 'x'.repeat(201) }, 'orderId'), null);
    assert.equal(readDocIdRequest({ productId: 'abc' }, 'orderId'), null);
  });
});
