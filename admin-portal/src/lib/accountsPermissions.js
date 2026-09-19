/**
 * @typedef {'rto-work-status' | 'sell-accounts'} AccountModuleKey
 * @typedef {{
 *   key: AccountModuleKey;
 *   labelKey: string;
 *   defaultLabel: string;
 *   permissions: string[];
 *   createPermissions: string[];
 *   updatePermissions: string[];
 *   deletePermissions: string[];
 *   exportPermission: string;
 * }} AccountNavItem
 */

/** @type {AccountNavItem[]} */
export const accountsNavItems = [
  {
    key: 'rto-work-status',
    labelKey: 'admin.rtoWorkStatus',
    defaultLabel: 'RTO Work Status',
    permissions: ['accounts.rto.read', 'accounts.rto.crud'],
    createPermissions: ['accounts.rto.create', 'accounts.rto.crud'],
    updatePermissions: ['accounts.rto.update', 'accounts.rto.crud'],
    deletePermissions: ['accounts.rto.delete', 'accounts.rto.crud'],
    exportPermission: 'accounts.rto.export',
  },
  {
    key: 'sell-accounts',
    labelKey: 'admin.sellAccounts',
    defaultLabel: 'Sell Accounts',
    permissions: ['accounts.sell.read', 'accounts.sell.crud'],
    createPermissions: ['accounts.sell.create', 'accounts.sell.crud'],
    updatePermissions: ['accounts.sell.update', 'accounts.sell.crud'],
    deletePermissions: ['accounts.sell.delete', 'accounts.sell.crud'],
    exportPermission: 'accounts.sell.export',
  },
];

export const accountAnyPermissions = accountsNavItems.flatMap((item) => item.permissions);

/**
 * @param {AccountModuleKey} key
 */
const findAccountModule = (key) => {
  const item = accountsNavItems.find((moduleItem) => moduleItem.key === key);
  if (!item) {
    throw new Error(`Unknown accounts module: ${key}`);
  }
  return item;
};

/**
 * @param {AccountModuleKey} key
 */
export const getAccountReadPermission = (key) => findAccountModule(key).permissions[0];

/**
 * @param {AccountModuleKey} key
 */
export const getAccountCreatePermissions = (key) => findAccountModule(key).createPermissions;

/**
 * @param {AccountModuleKey} key
 */
export const getAccountUpdatePermissions = (key) => findAccountModule(key).updatePermissions;

/**
 * @param {AccountModuleKey} key
 */
export const getAccountDeletePermissions = (key) => findAccountModule(key).deletePermissions;

/**
 * @param {AccountModuleKey} key
 */
export const getAccountExportPermission = (key) => findAccountModule(key).exportPermission;
