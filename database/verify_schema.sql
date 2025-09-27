-- Schema Verification Script for Area51 Bot
-- This script checks if all required tables and columns exist

-- Check Users table structure
SELECT 'USERS TABLE CHECK' as check_type;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Verify critical columns exist
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'users' AND column_name = 'encrypted_private_key') 
        THEN '✅ encrypted_private_key EXISTS'
        ELSE '❌ encrypted_private_key MISSING'
    END as encrypted_private_key_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'users' AND column_name = 'encrypted_mnemonic') 
        THEN '✅ encrypted_mnemonic EXISTS'
        ELSE '❌ encrypted_mnemonic MISSING'
    END as encrypted_mnemonic_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'users' AND column_name = 'username') 
        THEN '✅ username EXISTS'
        ELSE '❌ username MISSING'
    END as username_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'users' AND column_name = 'last_activity') 
        THEN '✅ last_activity EXISTS'
        ELSE '❌ last_activity MISSING'
    END as last_activity_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'users' AND column_name = 'is_active') 
        THEN '✅ is_active EXISTS'
        ELSE '❌ is_active MISSING'
    END as is_active_check;

-- Check Transactions table
SELECT 'TRANSACTIONS TABLE CHECK' as check_type;
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'transactions' AND column_name = 'type') 
        THEN '✅ transactions.type EXISTS'
        ELSE '❌ transactions.type MISSING'
    END as transactions_type_check;

-- Check Access Code tables
SELECT 'ACCESS CODE TABLES CHECK' as check_type;
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables 
                     WHERE table_name = 'access_codes') 
        THEN '✅ access_codes table EXISTS'
        ELSE '❌ access_codes table MISSING'
    END as access_codes_table_check,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables 
                     WHERE table_name = 'user_access') 
        THEN '✅ user_access table EXISTS'
        ELSE '❌ user_access table MISSING'
    END as user_access_table_check;

-- Check user_access table structure
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'user_access' AND column_name = 'used_at') 
        THEN '✅ user_access.used_at EXISTS'
        ELSE '❌ user_access.used_at MISSING'
    END as user_access_used_at_check;

-- Check all required tables exist
SELECT 'ALL TABLES CHECK' as check_type;
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('users', 'user_settings', 'transactions', 'portfolio_entries', 
                           'user_states', 'temp_sell_data', 'access_codes', 'user_access',
                           'performance_metrics', 'error_logs') 
        THEN '✅ REQUIRED'
        ELSE '⚠️ OPTIONAL'
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check indexes
SELECT 'INDEXES CHECK' as check_type;
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN ('users', 'transactions', 'access_codes', 'user_access')
ORDER BY tablename, indexname;

-- Check functions
SELECT 'FUNCTIONS CHECK' as check_type;
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_name IN ('update_updated_at_column', 'update_code_usage', 'cleanup_expired_data')
ORDER BY routine_name;

-- Check views
SELECT 'VIEWS CHECK' as check_type;
SELECT 
    table_name as view_name
FROM information_schema.views 
WHERE table_schema = 'public'
AND table_name IN ('access_code_stats', 'user_access_summary')
ORDER BY table_name;

-- Final summary
SELECT 'SCHEMA VERIFICATION SUMMARY' as check_type;
SELECT 
    COUNT(*) as total_tables,
    COUNT(CASE WHEN table_name IN ('users', 'user_settings', 'transactions', 'portfolio_entries', 
                                  'user_states', 'temp_sell_data', 'access_codes', 'user_access',
                                  'performance_metrics', 'error_logs') THEN 1 END) as required_tables_found
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE';

-- Check PostgreSQL version
SELECT 'POSTGRESQL VERSION' as check_type, version() as postgresql_version;
