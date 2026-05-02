# CSV Upload Troubleshooting Guide

## Problem
When uploading a CSV or Excel file, you encounter:
```
Error processing file: (psycopg.errors.UndefinedColumn) column "user_id" of relation "dataset_meta" does not exist
```

## Root Cause
Your database schema is out of sync with the application code:
- **ORM Models** (`backend/app/models_db.py`) expect a `user_id` column in `dataset_meta` table
- **Actual Database** schema is missing this column
- Uploads fail when the app tries to insert records

## Solution

### Step 1: Apply Database Migrations
From the `backend/` directory, run:
```bash
python -m alembic upgrade head
```

This migration (0021_dataset_meta_user_id) will:
- Add the missing `user_id` column (nullable) to `dataset_meta`
- Create an index on `(user_id, project_id)` for faster queries
- Check for existing columns first (safe to run multiple times)

### Step 2: Verify the Migration Applied
```bash
python -m alembic current
```
You should see: `0021_dataset_meta_user_id`

### Step 3: Restart Your Backend
If a development server is running, restart it to load the updated schema.

### Step 4: Test the Upload
Try uploading your CSV/Excel file again through the DataHub UI.

## If It Still Fails

If you still see an error after applying the migration:

1. **Check the error message** in your browser console (F12 → Console tab)
2. **Copy the full error** and send it over
3. Possible other schema issues:
   - Missing columns in other tables
   - Incorrect data types
   - Foreign key constraints

We have comprehensive logging enabled, so the error message will indicate exactly which column is missing.

## Schema History

The mismatch happened because:
1. Initial migrations (0001-0020) created basic `dataset_meta` table
2. ORM models were updated to include `user_id` for user-scoped queries
3. Migration to add `user_id` was missing from the Alembic history
4. Solution: Migration 0021 adds it safely and idempotently

## Files Modified
- `backend/alembic/versions/0021_dataset_meta_user_id.py` - Safe migration with checks
- `backend/app/routers/imports.py` - Fixed logging setup to debug upload issues
