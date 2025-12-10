# Actual Event Table Field Names

Based on the error messages from Supabase, I need to know if you changed these from camelCase to snake_case:

## Fields That Failed:
1. ❌ `deviceType` - Database has `device_type`? 
2. ❌ `userAgent` - Database has `user_agent`?

## Potentially Changed (need to verify):
- Your specs.md shows `userAgent` (line 116) but database might have `user_agent`
- Your specs.md shows `deviceType` (line 139) but database might have `device_type`

## All camelCase fields in specs.md:
From your document:
- Line 116: `userAgent TEXT` 
- Line 139: `deviceType TEXT`

## Questions:
1. Did you change ALL field names to snake_case in the actual Supabase database?
2. Or are some camelCase and some snake_case?

## To check yourself:
Run in Supabase SQL Editor:
```sql
\d event
```

Or:
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'event' 
ORDER BY column_name;
```

This will show ALL column names so we can fix the worker to match.

