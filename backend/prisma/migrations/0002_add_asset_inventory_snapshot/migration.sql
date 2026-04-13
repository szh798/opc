-- Add enum value for asset inventory flow snapshot
ALTER TYPE "SnapshotKind" ADD VALUE IF NOT EXISTS 'ASSET_INVENTORY';
