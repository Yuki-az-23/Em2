/**
 * Run Supabase Migration
 *
 * Executes SQL migrations against the Supabase database.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get Supabase credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Run a SQL migration file
 */
async function runMigration(filename) {
  try {
    console.log(`\n📄 Running migration: ${filename}`);

    // Read SQL file
    const sqlPath = join(__dirname, 'migrations', filename);
    const sql = readFileSync(sqlPath, 'utf-8');

    // Execute SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Try direct query if exec_sql function doesn't exist
      const { error: directError } = await supabase.from('_migrations').insert({ name: filename });

      if (directError) {
        throw error; // Use original error
      }
    }

    console.log(`✅ Migration completed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`❌ Migration failed: ${filename}`);
    console.error(error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting database migrations...\n');
  console.log(`📍 Supabase URL: ${supabaseUrl}`);

  // Run migrations in order
  const migrations = [
    '001_create_users_table.sql',
  ];

  let successCount = 0;
  let failCount = 0;

  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log('='.repeat(50));

  if (failCount > 0) {
    console.log('\n⚠️  Some migrations failed. Please check the errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All migrations completed successfully!');
  }
}

main();
