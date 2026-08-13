import { createClient } from '@supabase/supabase-js';

// Lấy chìa khóa từ file .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Tạo và xuất ra cầu nối
export const supabase = createClient(supabaseUrl, supabaseAnonKey);