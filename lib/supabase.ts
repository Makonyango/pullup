import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dvtdfhdwfukjqsbpuogs.supabase.co';
const supabaseAnonKey = 'sb_publishable_q1BUJo-PQp_MASXT-6Mh_A_e39reAb1';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);