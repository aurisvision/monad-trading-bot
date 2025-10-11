-- Migration Script: Remove Access Code System
-- This script safely removes all access code related tables and data
-- Created: $(date)
-- Purpose: Complete removal of access code system from development environment

-- Start transaction to ensure atomicity
BEGIN;

-- Log the migration start
DO $$
BEGIN
    RAISE NOTICE 'Starting removal of Access Code System at %', NOW();
END $$;

-- Step 1: Drop foreign key constraints first to avoid dependency issues
DO $$
BEGIN
    -- Drop foreign key constraint from user_access table
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_access_telegram_id_fkey' 
        AND table_name = 'user_access'
    ) THEN
        ALTER TABLE user_access DROP CONSTRAINT user_access_telegram_id_fkey;
        RAISE NOTICE 'Dropped foreign key constraint: user_access_telegram_id_fkey';
    END IF;
END $$;

-- Step 2: Backup data before deletion (optional - for safety)
DO $$
BEGIN
    -- Create backup tables with timestamp
    EXECUTE format('CREATE TABLE access_codes_backup_%s AS SELECT * FROM access_codes', 
                   to_char(NOW(), 'YYYY_MM_DD_HH24_MI_SS'));
    EXECUTE format('CREATE TABLE user_access_backup_%s AS SELECT * FROM user_access', 
                   to_char(NOW(), 'YYYY_MM_DD_HH24_MI_SS'));
    RAISE NOTICE 'Created backup tables for access_codes and user_access';
END $$;

-- Step 3: Drop indexes related to access code tables
DO $$
DECLARE
    index_name TEXT;
BEGIN
    -- Drop all indexes on access_codes table
    FOR index_name IN 
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'access_codes' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', index_name);
        RAISE NOTICE 'Dropped index: %', index_name;
    END LOOP;
    
    -- Drop all indexes on user_access table
    FOR index_name IN 
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'user_access' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', index_name);
        RAISE NOTICE 'Dropped index: %', index_name;
    END LOOP;
END $$;

-- Step 4: Drop sequences associated with the tables
DO $$
BEGIN
    -- Drop sequence for access_codes table
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'access_codes_id_seq') THEN
        DROP SEQUENCE IF EXISTS access_codes_id_seq CASCADE;
        RAISE NOTICE 'Dropped sequence: access_codes_id_seq';
    END IF;
    
    -- Drop sequence for user_access table
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'user_access_id_seq') THEN
        DROP SEQUENCE IF EXISTS user_access_id_seq CASCADE;
        RAISE NOTICE 'Dropped sequence: user_access_id_seq';
    END IF;
END $$;

-- Step 5: Drop the tables
DO $$
BEGIN
    -- Drop user_access table first (child table)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_access') THEN
        DROP TABLE user_access CASCADE;
        RAISE NOTICE 'Dropped table: user_access';
    END IF;
    
    -- Drop access_codes table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'access_codes') THEN
        DROP TABLE access_codes CASCADE;
        RAISE NOTICE 'Dropped table: access_codes';
    END IF;
END $$;

-- Step 6: Clean up any remaining references in other tables (if any)
DO $$
BEGIN
    -- Check if users table has any access_code related columns and remove them
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'access_code'
    ) THEN
        ALTER TABLE users DROP COLUMN IF EXISTS access_code;
        RAISE NOTICE 'Removed access_code column from users table';
    END IF;
    
    -- Remove any other access code related columns from users table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'access_granted_at'
    ) THEN
        ALTER TABLE users DROP COLUMN IF EXISTS access_granted_at;
        RAISE NOTICE 'Removed access_granted_at column from users table';
    END IF;
END $$;

-- Step 7: Verify removal
DO $$
BEGIN
    -- Verify tables are removed
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'access_codes') AND
       NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_access') THEN
        RAISE NOTICE 'SUCCESS: All access code tables have been removed successfully';
    ELSE
        RAISE EXCEPTION 'ERROR: Some access code tables still exist';
    END IF;
END $$;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Access Code System removal completed successfully at %', NOW();
    RAISE NOTICE 'Backup tables created with timestamp suffix for safety';
    RAISE NOTICE 'System is now ready to operate without access code restrictions';
END $$;

-- Commit the transaction
COMMIT;

-- Final verification query
SELECT 
    'access_codes' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'access_codes') 
         THEN 'EXISTS' ELSE 'REMOVED' END as status
UNION ALL
SELECT 
    'user_access' as table_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_access') 
         THEN 'EXISTS' ELSE 'REMOVED' END as status;