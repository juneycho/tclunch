# TC LUNCH (TC 점심)

회사 점심 신청 앱. 직원이 달력에서 먹을 날을 신청하면 **식사일 7일 전 23:59에 마감**되고, 요리사는 확정 인원을 보고 메뉴를 정합니다. 인원이 많으면 큰 메뉴를 나눠 먹고, 적으면 간단한 메뉴로 해서 식비를 아끼는 것이 목적입니다.

테니스 앱(TENNIS-MASTER)과 같은 구조입니다: **Vite + React 화면 → Vercel**, **데이터·로그인 → Supabase**. 휴대폰에서 "홈 화면에 추가"하면 앱처럼 설치됩니다.

## 기능

| 누가 | 할 수 있는 것 |
| --- | --- |
| 직원 | 본인 아이디로 로그인, 달력에서 신청/취소(마감 전까지), 손님 0~N명 추가, 식사 당일 "먹었어요" 출석 체크, 내 노쇼 횟수와 알림 보기 |
| 요리사 | 2주간 식사일별 확정 인원(직원+손님), 메뉴 등록(신청자에게 알림), 출석 체크(오늘·어제), 식비 지출 입력 |
| 관리자 | 가입 승인, 전출자 비활성화, 역할 지정, 비밀번호 초기화, 예산, 휴무일/운영일, 마감 후 예외 수정, 노쇼 현황, 설정, 변경 기록 |

- **대리 신청 불가**: 모든 쓰기는 DB 함수가 로그인한 본인 기준으로 처리하고, 테이블에 직접 쓰는 권한은 없습니다(RLS).
- **노쇼**: 식사 당일 15시까지 출석 체크가 안 된 신청자는 노쇼. 최근 90일 3회 이상이면 관리자에게도 알림. (숫자는 관리자 설정에서 변경)
- **알림**: 마감 전날 리마인드, 인원 확정 → 요리사, 메뉴 등록 → 신청자, 노쇼, 가입 승인 요청. 앱 안 알림함 + (선택) 휴대폰 푸시.
- **예산**: 총예산 / 사용 / 남은 예산 / 1인 1식 평균을 화면 맨 위에 표시.
- 주말과 공휴일(2026~2027, 대체공휴일 포함)은 기본 휴무.

## 설치 (처음 한 번)

### 1. Supabase
1. [supabase.com](https://supabase.com/dashboard) → **New project** → 이름 `TC Lunch`, 지역 **Seoul**. (무료 플랜은 프로젝트 2개까지라 테니스와 함께 쓸 수 있어요.)
2. **SQL Editor** → `supabase/setup.sql` 내용을 전부 붙여넣고, 맨 아래 `'여기에-초대코드'`를 직원용 초대 코드(6자 이상)로 바꾼 뒤 **Run**.
3. **Authentication → Sign In / Providers → Email** 에서 **Confirm email 끄기**. (아이디로 로그인하는 방식이라 메일 인증을 쓰지 않아요.)
4. (선택, 휴대폰 푸시) **Edge Functions → Deploy a new function → Via Editor**, 이름 `push-dispatch`, `supabase/functions/push-dispatch/index.ts` 내용 붙여넣고 배포 → 함수 설정에서 **Verify JWT 끄기**.

### 2. Vercel
1. [vercel.com](https://vercel.com/new) → `juneycho/tclunch` 저장소 Import.
2. Environment Variables에 Supabase **Project Settings → API**의 값 두 개 입력:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (anon public 키. service_role 키는 절대 넣지 마세요)
3. Deploy. 이후 `main`에 push하면 자동 배포됩니다.

### 3. 첫 사용
1. 앱 주소에서 **가입하기** → 초대 코드로 맨 처음 가입한 사람이 **관리자**가 됩니다.
2. 관리자 → 예산 입력, 요리사 계정에 "요리사" 체크(식사 안 하면 "식사" 체크 해제).
3. 직원들에게 앱 주소와 초대 코드 공유 → 가입하면 관리자가 승인.

> Supabase 무료 플랜은 1주일 동안 아무도 안 쓰면 일시정지돼요. 매일 쓰면 문제없고, 멈추면 대시보드에서 Restore 누르면 됩니다.

## 개발

```bash
npm install
cp .env.example .env.local   # Supabase URL / anon key 입력
npm run dev                  # http://localhost:5173
npm run setup-sql            # migrations → supabase/setup.sql 다시 만들기
npm test                     # DB 규칙 테스트 (로컬 Postgres 필요: PGHOST/PGPORT/PGUSER)
```

DB 규칙을 바꿀 때는 `supabase/migrations/`에 새 파일을 추가하고 Supabase SQL Editor에서 그 파일만 실행하세요.

## 구조

```
supabase/
  migrations/      테이블·권한(RLS)·규칙 함수·주기 작업(pg_cron)
  setup.sql        위를 합친 설치용 파일 (자동 생성)
  functions/push-dispatch/   휴대폰 푸시 발송
web/src/
  api.js           화면 → Supabase 호출 연결
  Calendar / DayPanel / Cook / Admin / My  화면
test/              DB 규칙 테스트
```
