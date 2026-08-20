import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  const PAGE_SIZE = 1000;
  let allRows: any[] = [];
  let from = 0;

  console.log("Fetching all records...");

  while (true) {
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(error);
      break;
    }

    const page = data ?? [];
    allRows = allRows.concat(page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`Fetched ${allRows.length} records.`);

  const map = new Map();
  const duplicates = [];

  for (const r of allRows) {
    const key = `${r.member_id}-${r.session_id}`;
    if (map.has(key)) {
      duplicates.push({ existing: map.get(key), duplicate: r });
    } else {
      map.set(key, r);
    }
  }

  console.log(`Found ${duplicates.length} duplicate pairs.`);
  if (duplicates.length > 0) {
    console.log(JSON.stringify(duplicates.slice(0, 5), null, 2)); // log first 5
  }
}

checkDuplicates();
