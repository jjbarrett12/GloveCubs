-- Production Hardening Tables
-- Rate limiting, advisory locks, and error telemetry

-- ============================================================================
-- RATE LIMITING
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_identifier_created 
    ON rate_limit_events(identifier, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT UNIQUE NOT NULL,
    blocked_until TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_identifier 
    ON rate_limit_blocks(identifier);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_blocked_until 
    ON rate_limit_blocks(blocked_until);

-- ============================================================================
-- ADVISORY LOCKS (fallback for when pg_advisory_lock unavailable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS advisory_locks (
    lock_id TEXT PRIMARY KEY,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advisory_locks_expires 
    ON advisory_locks(expires_at);

-- ============================================================================
-- ERROR TELEMETRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS error_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    message TEXT NOT NULL,
    error_code TEXT,
    stack_trace TEXT,
    context JSONB,
    entity_type TEXT,
    entity_id TEXT,
    user_id TEXT,
    supplier_id TEXT,
    buyer_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_telemetry_category 
    ON error_telemetry(category);

CREATE INDEX IF NOT EXISTS idx_error_telemetry_severity 
    ON error_telemetry(severity);

CREATE INDEX IF NOT EXISTS idx_error_telemetry_created 
    ON error_telemetry(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_telemetry_entity 
    ON error_telemetry(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS error_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    error_code TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_alerts_acknowledged 
    ON error_alerts(acknowledged, created_at DESC);

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Clean up old rate limit data
CREATE OR REPLACE FUNCTION cleanup_rate_limit_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    cutoff TIMESTAMPTZ := NOW() - INTERVAL '24 hours';
BEGIN
    -- Delete old events
    DELETE FROM rate_limit_events WHERE created_at < cutoff;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete expired blocks
    DELETE FROM rate_limit_blocks WHERE blocked_until < NOW();
    
    -- Delete expired advisory locks
    DELETE FROM advisory_locks WHERE expires_at < NOW();
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up old telemetry data (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_error_telemetry()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    cutoff TIMESTAMPTZ := NOW() - INTERVAL '30 days';
BEGIN
    DELETE FROM error_telemetry WHERE created_at < cutoff;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete acknowledged alerts older than 7 days
    DELETE FROM error_alerts 
    WHERE acknowledged = TRUE 
      AND acknowledged_at < NOW() - INTERVAL '7 days';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRANSACTION HELPERS
-- ============================================================================

-- Begin transaction with isolation level
CREATE OR REPLACE FUNCTION begin_transaction(
    p_isolation_level TEXT DEFAULT 'read_committed',
    p_timeout_ms INTEGER DEFAULT 30000
)
RETURNS VOID AS $$
BEGIN
    -- Set statement timeout
    EXECUTE format('SET LOCAL statement_timeout = %s', p_timeout_ms);
    
    -- Set isolation level
    CASE p_isolation_level
        WHEN 'serializable' THEN
            SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
        WHEN 'repeatable_read' THEN
            SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
        ELSE
            SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Commit transaction
CREATE OR REPLACE FUNCTION commit_transaction()
RETURNS VOID AS $$
BEGIN
    COMMIT;
END;
$$ LANGUAGE plpgsql;

-- Rollback transaction
CREATE OR REPLACE FUNCTION rollback_transaction()
RETURNS VOID AS $$
BEGIN
    ROLLBACK;
END;
$$ LANGUAGE plpgsql;

-- Advisory lock wrappers (for RPC access)
CREATE OR REPLACE FUNCTION pg_try_advisory_lock(lock_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN pg_try_advisory_lock(lock_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_advisory_unlock(lock_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN pg_advisory_unlock(lock_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE rate_limit_events IS 'Sliding window rate limit event tracking';
COMMENT ON TABLE rate_limit_blocks IS 'Active rate limit blocks';
COMMENT ON TABLE advisory_locks IS 'Table-based advisory locks fallback';
COMMENT ON TABLE error_telemetry IS 'Production error event tracking';
COMMENT ON TABLE error_alerts IS 'Critical error alerts requiring acknowledgement';
