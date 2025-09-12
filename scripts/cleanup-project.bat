@echo off
echo Starting Area51 Bot Project Cleanup...

REM Move unused files to archive
move "scripts\migrate-to-postgresql.js" "archive\"
move "scripts\fix-wallet-decryption.js" "archive\"
move "scripts\fix-user-states-table.sql" "archive\"
move "scripts\fix-user-settings-schema.sql" "archive\"
move "scripts\test-migration.js" "archive\"
move "scripts\reset-database.sql" "archive\"

echo Cleanup completed. Files moved to archive folder.
pause
