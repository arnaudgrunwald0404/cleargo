#!/bin/bash
# Script to apply all database migrations to Supabase

set -e

# Load environment variables
source .env

# Extract database details from Supabase URL
# Format: https://PROJECT_REF.supabase.co
PROJECT_REF=$(echo $NEXT_PUBLIC_SUPABASE_URL | sed 's|https://||' | sed 's|.supabase.co||')

# Construct PostgreSQL connection string
# Format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
DB_URL="postgresql://postgres.${PROJECT_REF}:${SUPABASE_SERVICE_ROLE_KEY}@aws-0-us-west-1.pooler.supabase.com:6543/postgres"

echo "Applying migrations to Supabase database..."
echo "Project: $PROJECT_REF"
echo ""

# Apply each migration in order
for migration in db/migrations/*.sql; do
    echo "Applying $(basename $migration)..."
    psql "$DB_URL" -f "$migration"
    if [ $? -eq 0 ]; then
        echo "✓ $(basename $migration) applied successfully"
    else
        echo "✗ Failed to apply $(basename $migration)"
        exit 1
    fi
    echo ""
done

echo "All migrations applied successfully!"
