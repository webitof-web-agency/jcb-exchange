import assert from 'node:assert/strict';
import test from 'node:test';
import { getMarketplaceTemplateComponents } from '../modules/whatsapp-core/marketplaceTemplatePolicy';
import { validateVehicleTransportWhatsAppTemplate } from './vehicleTransportWhatsAppTemplate';

const BODY = 'Hello {{1}},\nYour machine {{2}} (Reg. No. {{3}}) has been dispatched.\nDelivery Challan No. {{4}} is attached.\nCurrent stage: {{5}}\nThank you for choosing JCB Exchange.';

const approved = {
  components: [
    { type: 'HEADER', format: 'DOCUMENT' },
    { type: 'BODY', text: BODY },
  ],
};

test('accepts a template with a document header and variables 1 to 5', () => {
  assert.doesNotThrow(() => validateVehicleTransportWhatsAppTemplate(approved));
});

test('rejects a template without a document header', () => {
  assert.throws(
    () => validateVehicleTransportWhatsAppTemplate({ components: [{ type: 'HEADER', format: 'TEXT', text: 'Update' }, { type: 'BODY', text: BODY }] }),
    /DOCUMENT header/,
  );
});

test('rejects a template whose body does not use exactly {{1}} to {{5}}', () => {
  assert.throws(
    () => validateVehicleTransportWhatsAppTemplate({ components: [{ type: 'HEADER', format: 'DOCUMENT' }, { type: 'BODY', text: 'Hi {{1}}, stage {{2}}.' }] }),
    /\{\{1\}\} through \{\{5\}\}/,
  );
});

test('both transport events fill the five body variables in the template order', () => {
  const payload = {
    customerName: 'VIKASH KUMAR',
    machineTitle: 'CATERPILLAR INDIA PRIVATE LIMITED 424B BACK HOE LOADER',
    vehicleNumber: 'CG13LA2263',
    challanNumber: '02',
    transportStatus: 'Out For Delivery',
  };
  for (const eventCode of ['VEHICLE_TRANSPORT_DISPATCHED', 'VEHICLE_TRANSPORT_STATUS_UPDATE']) {
    const components = getMarketplaceTemplateComponents(eventCode, payload, approved.components);
    assert.deepEqual(components, [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'VIKASH KUMAR' },
        { type: 'text', text: 'CATERPILLAR INDIA PRIVATE LIMITED 424B BACK HOE LOADER' },
        { type: 'text', text: 'CG13LA2263' },
        { type: 'text', text: '02' },
        { type: 'text', text: 'Out For Delivery' },
      ],
    }]);
  }
});
