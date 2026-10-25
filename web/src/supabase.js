import { createClient } from '@supabase/supabase-js';

// Vercel(또는 .env.local)에 넣는 공개 값. anon 키는 공개돼도 괜찮고, 권한은 DB 규칙(RLS)이 지킨다.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = SUPABASE_URL && ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY) : null;

// supabase/functions/_shared/login.ts 의 EMAIL_DOMAIN 과 같아야 한다
const EMAIL_DOMAIN = 'tclunch.example.com';
export const toEmail = (loginId) => `${String(loginId).trim().toLowerCase()}@${EMAIL_DOMAIN}`;
