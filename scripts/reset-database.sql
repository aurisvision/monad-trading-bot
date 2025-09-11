-- Reset Area51 Bot Database
-- This will clear all user data and allow fresh wallet generation

-- Clear all user-related data
TRUNCATE TABLE user_states CASCADE;
TRUNCATE TABLE user_settings CASCADE;
TRUNCATE TABLE transactions CASCADE;
TRUNCATE TABLE portfolio_entries CASCADE;
TRUNCATE TABLE performance_metrics CASCADE;
TRUNCATE TABLE users CASCADE;

-- Reset sequences to start from 1
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE user_settings_id_seq RESTART WITH 1;
ALTER SEQUENCE user_states_id_seq RESTART WITH 1;
ALTER SEQUENCE transactions_id_seq RESTART WITH 1;
ALTER SEQUENCE portfolio_entries_id_seq RESTART WITH 1;
ALTER SEQUENCE performance_metrics_id_seq RESTART WITH 1;

-- Verify tables are empty
SELECT 'users' as table_name, COUNT(*) as record_count FROM users
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings
UNION ALL
SELECT 'user_states', COUNT(*) FROM user_states
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'portfolio_entries', COUNT(*) FROM portfolio_entries
UNION ALL
SELECT 'performance_metrics', COUNT(*) FROM performance_metrics;

-- Show success message
SELECT 'Database reset completed successfully!' as status;
