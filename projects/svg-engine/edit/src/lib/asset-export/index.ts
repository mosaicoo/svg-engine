export { AssetExportRegistry } from './asset-export-registry.service';
export { AssetExportRunner } from './asset-export-runner.service';
// D-077 follow-up — opt-in localStorage persistence layer.
// Mirror of SnapshotsPersistenceService (D-073) — round-trips slots()
// so the user's batch export recipes survive page reloads.
export { AssetExportPersistenceService } from './asset-export-persistence.service';
export { ASSET_EXPORT_STORAGE_KEY } from './asset-export.config';
export type { ExportSlot, ExportSlotInput, ExportSlotResult } from './asset-export.types';
