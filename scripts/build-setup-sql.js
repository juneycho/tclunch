// supabase/migrations/*.sql 을 하나로 합쳐 supabase/setup.sql 을 만든다.
// Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 한 번 실행하면 된다.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../supabase/migrations');
const parts = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), 'utf8')}`);
const header = `-- TC 점심 설치 SQL (자동 생성: npm run setup-sql, 직접 고치지 말고 migrations를 고치세요)
-- 새 Supabase 프로젝트의 SQL Editor에 전체를 붙여넣고 Run 하세요. 한 번만 실행합니다.
-- 실행 전에 맨 아래 초대 코드를 원하는 값으로 바꾸세요.

`;
const footer = `
-- ===== 초대 코드 (직원 가입용, 6자 이상) =====
-- 이 코드로 맨 처음 가입하는 사람이 관리자가 됩니다. 나중에 앱 관리자 > 설정에서 바꿀 수 있어요.
update private.secrets set value = '여기에-초대코드' where key = 'invite_code';
`;
fs.writeFileSync(path.resolve(dir, '../setup.sql'), header + parts.join('\n') + footer);
console.log('supabase/setup.sql 생성');
