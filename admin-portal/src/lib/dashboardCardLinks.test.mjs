import test from 'node:test';
import assert from 'node:assert/strict';

import { getDashboardCards } from './dashboardCardLinks.js';

test('returns clickable super admin dashboard cards for related management pages', () => {
  const cards = getDashboardCards({ portal: 'superadmin' });

  assert.deepEqual(
    cards.map((card) => ({ key: card.key, href: card.href, isClickable: card.isClickable })),
    [
      { key: 'totalPartners', href: '/admin/partners', isClickable: true },
      { key: 'approvedPartners', href: '/admin/partners', isClickable: true },
      { key: 'pendingKyc', href: '/admin/verifications', isClickable: true },
      { key: 'activeListings', href: '/admin/listings', isClickable: true },
      { key: 'totalEnquiries', href: '/admin/enquiries', isClickable: true },
    ]
  );
});

test('only enables employee dashboard cards for pages the employee can access', () => {
  const cards = getDashboardCards({
    portal: 'employee',
    userPermissions: ['dashboard.view', 'partners.read', 'listings.read'],
  });

  assert.deepEqual(
    cards.map((card) => ({ key: card.key, href: card.href, isClickable: card.isClickable })),
    [
      { key: 'totalPartners', href: '/employee/partners', isClickable: true },
      { key: 'approvedPartners', href: '/employee/partners', isClickable: true },
      { key: 'pendingKyc', href: undefined, isClickable: false },
      { key: 'activeListings', href: '/employee/listings', isClickable: true },
      { key: 'totalEnquiries', href: undefined, isClickable: false },
    ]
  );
});
