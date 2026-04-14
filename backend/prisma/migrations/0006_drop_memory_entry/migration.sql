-- Cleanup —— 下线旧 MemoryEntry 表 + MemoryCategory enum
-- 自 Phase 1.3 起读路径已切到 UserFact，本表 0 行 0 引用。
-- 注意：本迁移是不可逆的，回滚需要重建 enum + 表 + 重新关联 User。

DROP TABLE IF EXISTS "MemoryEntry";
DROP TYPE  IF EXISTS "MemoryCategory";
