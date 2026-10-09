'use strict';

const LEGACY_WAREHOUSE_WRITE_DISABLED = 'LEGACY_WAREHOUSE_WRITE_DISABLED';
const WAREHOUSE_MIGRATION_MESSAGE = 'This warehouse action has moved to the native admin workflow.';
const WAREHOUSE_MIGRATION_CODE = 'WAREHOUSE_NATIVE_MIGRATION';

class LegacyWarehouseWriteDisabledError extends Error {
  constructor() {
    super(WAREHOUSE_MIGRATION_MESSAGE);
    this.code = LEGACY_WAREHOUSE_WRITE_DISABLED;
    this.name = 'LegacyWarehouseWriteDisabledError';
  }
}

function assertLegacyWarehouseWriteBlocked() {
  throw new LegacyWarehouseWriteDisabledError();
}

function sendWarehouseMigrationGone(res, nativeWorkflow) {
  res.status(410).json({
    error: WAREHOUSE_MIGRATION_MESSAGE,
    code: WAREHOUSE_MIGRATION_CODE,
    native_workflow: nativeWorkflow || '/admin/inventory',
  });
}

module.exports = {
  LEGACY_WAREHOUSE_WRITE_DISABLED,
  WAREHOUSE_MIGRATION_MESSAGE,
  WAREHOUSE_MIGRATION_CODE,
  LegacyWarehouseWriteDisabledError,
  assertLegacyWarehouseWriteBlocked,
  sendWarehouseMigrationGone,
};
