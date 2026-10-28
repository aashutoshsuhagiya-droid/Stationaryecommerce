import assert from 'node:assert/strict';
import test from 'node:test';

import { vendorApplicationUpdateSchema, vendorRegistrationSchema } from './vendor-onboarding-validation';
import {
  canVendorAccessApprovedArtwork,
  canVendorAccessAssignedCustomerData,
  canVendorAccessCustomerData,
} from './vendor-operations-domain';

const validRegistration = {
  application: {
    ownerName: 'Asha Patel',
    businessName: 'Asha Print Works',
    email: 'asha@example.com',
    mobile: '9876543210',
    addressLine1: '12 Market Road',
    city: 'Ahmedabad',
    state: 'Gujarat',
    postalCode: '380015',
    servicePostalCodes: ['380015'],
    serviceCategoryIds: ['cat-name-slips'],
    printingServices: ['Digital labels'],
    equipment: ['Digital label press'],
    termsAccepted: true,
  },
  password: 'safe-password-2026',
  confirmPassword: 'safe-password-2026',
  otpChallengeId: 'd72c4e69-20e1-493d-bd2d-495b9270ed0f',
};

test('vendor correction updates enforce the registration city and state pairing', () => {
  assert.equal(vendorApplicationUpdateSchema.safeParse({ businessName: 'Updated Print Works' }).success, true);
  assert.equal(vendorApplicationUpdateSchema.safeParse({ city: 'Pune', state: 'Maharashtra' }).success, true);

  for (const correction of [
    { city: 'Pune', state: 'Gujarat' },
    { city: 'Pune' },
    { state: 'Maharashtra' },
  ]) {
    const parsed = vendorApplicationUpdateSchema.safeParse(correction);
    assert.equal(parsed.success, false);
    if (!parsed.success) assert.ok(parsed.error.issues.some((issue) => issue.path.join('.') === 'city'));
  }
});

test('only approved active vendors can access workspace and assigned customer data', () => {
  assert.equal(canVendorAccessCustomerData({ verificationStatus: 'PENDING', operationalStatus: 'INACTIVE' }), false);
  assert.equal(canVendorAccessCustomerData({ verificationStatus: 'APPROVED', operationalStatus: 'INACTIVE' }), false);
  assert.equal(canVendorAccessCustomerData({ verificationStatus: 'APPROVED', operationalStatus: 'SUSPENDED' }), false);
  assert.equal(canVendorAccessCustomerData({ verificationStatus: 'APPROVED', operationalStatus: 'CLOSED' }), false);
  assert.equal(canVendorAccessCustomerData({ verificationStatus: 'APPROVED', operationalStatus: 'ACTIVE' }), true);
});

test('customer records remain private after an assignment stops being active', () => {
  const activeVendor = { verificationStatus: 'APPROVED', operationalStatus: 'ACTIVE' };

  assert.equal(canVendorAccessAssignedCustomerData(activeVendor, 'ASSIGNED'), true);
  for (const status of ['PENDING', 'OFFERED', 'UNASSIGNED', 'EXPIRED', 'CANCELLED']) {
    assert.equal(canVendorAccessAssignedCustomerData(activeVendor, status), false);
  }
});

test('vendors can download only approved artwork for a current assignment', () => {
  const activeVendor = { verificationStatus: 'APPROVED', operationalStatus: 'ACTIVE' };

  assert.equal(canVendorAccessApprovedArtwork(activeVendor, 'ASSIGNED', 'APPROVED'), true);
  assert.equal(canVendorAccessApprovedArtwork(activeVendor, 'CANCELLED', 'APPROVED'), false);
  for (const status of ['UPLOADED', 'ATTACHED', 'REJECTED']) {
    assert.equal(canVendorAccessApprovedArtwork(activeVendor, 'ASSIGNED', status), false);
  }
});

test('registration has no configured required document types', () => {
  assert.equal(vendorRegistrationSchema.safeParse({ ...validRegistration, documentTypes: [] }).success, true);
});
