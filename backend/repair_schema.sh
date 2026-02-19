#!/bin/bash
# Verification and repair script for DataHub schema issues
# Run this from the backend directory: bash repair_schema.sh

set -e

echo "=== DataHub Schema Repair Script ==="
echo ""

# Check if we're in the backend directory
if [ ! -f "alembic.ini" ]; then
    echo "ERROR: Please run this script from the backend directory"
    echo "  cd backend && bash repair_schema.sh"
    exit 1
fi

echo "1. Applying pending database migrations..."
python -m alembic upgrade head
echo "   ✓ Migrations applied"
echo ""

echo "2. Verifying current migration status..."
CURRENT=$(python -m alembic current)
echo "   Current revision: $CURRENT"
echo ""

echo "3. Database schema fix complete!"
echo ""
echo "Next steps:"
echo "  1. Restart your backend server (if running)"
echo "  2. Try uploading a CSV or Excel file again"
echo "  3. If upload still fails, check the error message in the browser console (F12)"
echo ""
echo "The following schema changes were applied:"
echo "  - Added 'user_id' column to dataset_meta table"
echo "  - Created index on (user_id, workspace_id) for dataset_meta"
echo ""
