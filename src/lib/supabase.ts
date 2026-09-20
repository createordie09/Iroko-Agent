import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pqauyxkmxnpycjiegfob.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_w1HSK5yirDhzcTxUMrYnOg_rssWXPt-';

export const supabase = createClient(supabaseUrl, supabaseKey);
