import { createClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════
// ⚠️  아래 두 값을 본인의 Supabase 프로젝트 값으로 교체하세요!
//     Supabase 대시보드 > Settings > API 에서 확인 가능
// ═══════════════════════════════════════════════════════
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || 'YOUR_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
