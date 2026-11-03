import { createContext, useContext } from 'react';

// 화면 문구: 한국어(ko) · 영어(en) · 베트남어(vi). {이름} 자리는 값으로 바뀐다.
const D = {
  appTitle: { ko: 'Thanh Cong 점심신청', en: 'Thanh Cong Lunch Request', vi: 'Thanh Cong Đăng ký cơm trưa' },
  appSub: { ko: '점심신청', en: 'Lunch Request', vi: 'Đăng ký cơm trưa' },
  deadlineNotice: {
    ko: '매주 금요일 오후 5시, 차주의 식사 신청을 마감합니다.',
    en: 'Sign-ups for next week close every Friday at 5:00 PM.',
    vi: 'Đăng ký bữa trưa của tuần sau sẽ đóng lúc 17:00 thứ Sáu hằng tuần.',
  },
  loading: { ko: '불러오는 중…', en: 'Loading…', vi: 'Đang tải…' },
  name: { ko: '이름', en: 'Name', vi: 'Họ tên' },
  namePlaceholder: { ko: 'Hong Gildong', en: 'Hong Gildong', vi: 'Nguyen Van A' },
  englishOnly: { ko: '영어(알파벳)로만 쓸 수 있어요.', en: 'Use English letters only.', vi: 'Chỉ dùng chữ cái tiếng Anh (không dấu).' },
  enter: { ko: '들어가기', en: 'Enter', vi: 'Vào' },
  entering: { ko: '들어가는 중…', en: 'Entering…', vi: 'Đang vào…' },
  loginHint: { ko: '영어로 이름(닉네임)만 쓰고 예약하시면 됩니다.', en: 'Just enter your name (or nickname) in English to book.', vi: 'Chỉ cần nhập tên (biệt danh) bằng tiếng Anh để đăng ký.' },
  adminPassword: { ko: '관리자 비밀번호', en: 'Admin password', vi: 'Mật khẩu quản trị' },
  adminPwHint: { ko: '관리자 계정이라 비밀번호가 필요해요.', en: 'This is an admin account, so a password is required.', vi: 'Đây là tài khoản quản trị nên cần mật khẩu.' },
  hello: { ko: '{name}님', en: 'Hi, {name}', vi: 'Chào {name}' },

  tabCalendar: { ko: '달력', en: 'Calendar', vi: 'Lịch' },
  tabSheet: { ko: '요리사', en: 'Cook', vi: 'Bếp' },
  tabSummary: { ko: '내역', en: 'History', vi: 'Lịch sử' },
  tabMy: { ko: '알림', en: 'Notifications', vi: 'Thông báo' },
  tabAdmin: { ko: '관리자', en: 'Admin', vi: 'Quản trị' },

  budgetTotal: { ko: '총예산', en: 'Budget', vi: 'Ngân sách' },
  budgetSpent: { ko: '사용', en: 'Spent', vi: 'Đã chi' },
  budgetLeft: { ko: '남은 예산', en: 'Remaining', vi: 'Còn lại' },
  perMealAvg: { ko: '1인 1식 평균 {v}', en: 'Avg {v} per meal', vi: 'TB {v}/suất' },

  prevMonth: { ko: '이전 달', en: 'Previous month', vi: 'Tháng trước' },
  nextMonth: { ko: '다음 달', en: 'Next month', vi: 'Tháng sau' },
  monthTitle: { ko: '{y}년 {m}월', en: '{mon} {y}', vi: 'Tháng {m}/{y}' },
  weekdays: { ko: '일,월,화,수,목,금,토', en: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat', vi: 'CN,T2,T3,T4,T5,T6,T7' },
  people: { ko: '{n}명', en: '{n}', vi: '{n}' },
  peopleLong: { ko: '{n}명', en: '{n} people', vi: '{n} người' },
  adminCanEdit: { ko: '관리자는 수정 가능', en: 'admin can edit', vi: 'quản trị viên có thể sửa' },
  namedPlaceholder: { ko: '영어 이름 쓰고 등록 (1명)', en: 'Name in English (1 person)', vi: 'Tên tiếng Anh (1 người)' },
  namedAddBtn: { ko: '등록', en: 'Add', vi: 'Thêm' },
  namedAdded: { ko: '{name} 1명을 등록했어요.', en: 'Added {name}.', vi: 'Đã thêm {name}.' },
  confirmDeleteUser: { ko: '"{name}" 계정을 삭제할까요?\n신청한 인원 기록은 "{name}" 이름으로 그대로 남아요. 되돌릴 수 없어요.', en: 'Delete the account "{name}"?\nTheir bookings stay under the name "{name}". This cannot be undone.', vi: 'Xóa tài khoản "{name}"?\nCác lượt đăng ký vẫn giữ dưới tên "{name}". Không thể hoàn tác.' },
  userDeleted: { ko: '"{name}" 계정을 삭제했어요.', en: 'Deleted "{name}".', vi: 'Đã xóa "{name}".' },
  mealTimes: { ko: '{n}회', en: '{n} times', vi: '{n} lần' },
  legendOpen: { ko: '신청 가능', en: 'Open', vi: 'Đang mở' },
  legendConfirmed: { ko: '인원 확정', en: 'Confirmed', vi: 'Đã chốt' },
  legendMine: { ko: '내가 신청', en: 'Signed up', vi: 'Tôi đã đăng ký' },
  noShowWarn: {
    ko: '최근 90일 노쇼가 {n}회예요. 신청하신 날은 꼭 드시거나 마감 전에 취소해 주세요.',
    en: 'You have {n} no-shows in the last 90 days. Please eat on days you sign up for, or cancel before the deadline.',
    vi: 'Bạn đã vắng {n} lần trong 90 ngày qua. Hãy ăn vào ngày đã đăng ký hoặc hủy trước hạn.',
  },

  phase_open: { ko: '신청 가능', en: 'Open', vi: 'Đang mở' },
  phase_confirmed: { ko: '인원 확정', en: 'Confirmed', vi: 'Đã chốt' },
  phase_today: { ko: '오늘', en: 'Today', vi: 'Hôm nay' },
  phase_past: { ko: '지난 날', en: 'Past', vi: 'Đã qua' },
  dayLunch: { ko: '{d} 점심', en: 'Lunch · {d}', vi: 'Bữa trưa {d}' },
  close: { ko: '닫기', en: 'Close', vi: 'Đóng' },
  noLunch: { ko: '이날은 점심 운영을 하지 않아요', en: 'No lunch on this day', vi: 'Không có bữa trưa ngày này' },
  closesAt: { ko: '{d} {h} 마감', en: 'Closes {d} {h}', vi: 'Hạn {h} {d}' },
  total: { ko: '총 인원', en: 'Total', vi: 'Tổng' },
  staff: { ko: '직원', en: 'Staff', vi: 'Nhân viên' },
  guests: { ko: '손님', en: 'Guests', vi: 'Khách' },
  menu: { ko: '메뉴', en: 'Menu', vi: 'Thực đơn' },
  noMenuYet: { ko: '요리사가 아직 메뉴를 올리지 않았어요.', en: "The cook hasn't posted the menu yet.", vi: 'Đầu bếp chưa đăng thực đơn.' },
  myLunch: { ko: '내 점심 (나 1명)', en: 'My lunch (just me)', vi: 'Bữa trưa của tôi (1 người)' },
  signedUp: { ko: '신청했어요 ✓', en: "You're signed up ✓", vi: 'Đã đăng ký ✓' },
  signUpMe: { ko: '나 신청하기', en: 'Sign me up', vi: 'Đăng ký cho tôi' },
  cancel: { ko: '취소', en: 'Cancel', vi: 'Hủy' },
  cancelMine: { ko: '내 신청 취소', en: 'Cancel my sign-up', vi: 'Hủy đăng ký của tôi' },
  didSignUp: { ko: '신청했어요.', en: 'Signed up.', vi: 'Đã đăng ký.' },
  simpleAsk: { ko: '이 날 점심을 신청할까요?', en: 'Book lunch on this day?', vi: 'Đăng ký ăn trưa ngày này?' },
  simpleBooked: { ko: '신청돼 있어요 ({n}명). 취소하려면 아래 버튼을 누르세요.', en: 'You are booked ({n}). Press below to cancel.', vi: 'Đã đăng ký ({n}). Bấm bên dưới để hủy.' },
  didCancel: { ko: '취소했어요.', en: 'Cancelled.', vi: 'Đã hủy.' },
  closedChange: { ko: '마감되어 변경하려면 관리자에게 말해 주세요.', en: 'Sign-up is closed. Ask an admin to change it.', vi: 'Đã hết hạn. Hãy nhờ quản trị viên nếu cần thay đổi.' },
  signedUpClosed: { ko: '신청 완료.', en: "You're signed up.", vi: 'Đã đăng ký.' },
  guestsTitle: { ko: '외부 손님 추가', en: 'Add outside guests', vi: 'Thêm khách bên ngoài' },
  guestsHint: {
    ko: '손님 인원만 추가돼요. 내 신청은 위에서 따로 해요.',
    en: 'This adds guests only. Your own lunch is signed up separately above.',
    vi: 'Chỉ thêm số khách. Bữa trưa của bạn đăng ký riêng ở trên.',
  },
  guestNote: { ko: '메모 (예: 거래처 2명)', en: 'Note (e.g. client visit)', vi: 'Ghi chú (vd: khách đối tác)' },
  addGuestsBtn: { ko: '손님 {n}명 추가 (나 제외)', en: 'Add {n} guest(s) (not me)', vi: 'Thêm {n} khách (không gồm tôi)' },
  didAddGuests: { ko: '손님 {n}명을 추가했어요.', en: 'Added {n} guest(s).', vi: 'Đã thêm {n} khách.' },
  addedBy: { ko: '{name} 추가', en: 'by {name}', vi: 'do {name} thêm' },
  fewer: { ko: '줄이기', en: 'Fewer', vi: 'Bớt' },
  more: { ko: '늘리기', en: 'More', vi: 'Thêm' },
  ate: { ko: '🍚 먹었어요 (출석 체크)', en: '🍚 I ate (check in)', vi: '🍚 Tôi đã ăn (điểm danh)' },
  ateDone: { ko: '출석 완료 ✓', en: 'Checked in ✓', vi: 'Đã điểm danh ✓' },
  ateMsg: { ko: '출석 체크 완료! 맛있게 드세요.', en: 'Checked in. Enjoy your meal!', vi: 'Đã điểm danh. Chúc ngon miệng!' },
  attendees: { ko: '신청자 {n}명', en: '{n} signed up', vi: '{n} người đăng ký' },
  maxPeople: { ko: '한 사람이 최대 {n}명까지 신청할 수 있어요.', en: 'One person can book up to {n} people.', vi: 'Mỗi người đăng ký tối đa {n} người.' },
  byPerson: { ko: '신청자별 인원', en: 'People per booker', vi: 'Số người theo người đăng ký' },
  nobodyYet: { ko: '아직 없어요.', en: 'Nobody yet.', vi: 'Chưa có ai.' },
  attended: { ko: '출석', en: 'Ate', vi: 'Đã ăn' },
  noShow: { ko: '노쇼', en: 'No-show', vi: 'Vắng' },
  unknown: { ko: '미확인', en: 'Unchecked', vi: 'Chưa rõ' },
  remove: { ko: '삭제', en: 'Delete', vi: 'Xóa' },
  confirmRemoveSignup: { ko: '{name}님 신청을 삭제할까요?', en: "Delete {name}'s sign-up? (logged as an admin change)", vi: 'Xóa đăng ký của {name}? (sẽ được ghi lại)' },
  adminAddSignup: { ko: '관리자: 마감 후 신청자 추가', en: 'Admin: add a person after the deadline', vi: 'Quản trị: thêm người sau hạn' },
  pickStaff: { ko: '직원 선택', en: 'Choose staff', vi: 'Chọn nhân viên' },
  add: { ko: '추가', en: 'Add', vi: 'Thêm' },
  added: { ko: '추가했어요.', en: 'Added.', vi: 'Đã thêm.' },
  adminDay: { ko: '휴일 지정 / 해제', en: 'Mark as holiday / open', vi: 'Đặt ngày nghỉ / mở lại' },
  dayNote: { ko: '메모 (예: 창립기념일)', en: 'Note (e.g. company holiday)', vi: 'Ghi chú (vd: nghỉ lễ)' },
  makeClosed: { ko: '휴일로 변경', en: 'Change to holiday', vi: 'Đổi thành ngày nghỉ' },
  makeOpen: { ko: '운영일로', en: 'Open day', vi: 'Mở ngày' },
  confirmHoliday: { ko: '{d}을(를) 휴일로 바꿀까요? 이날 신청은 식사 횟수에서 빠져요.', en: 'Make {d} a holiday? Sign-ups on this day will not be counted.', vi: 'Đặt {d} là ngày nghỉ? Đăng ký ngày này sẽ không được tính.' },
  holidayNote: { ko: '휴일', en: 'Holiday', vi: 'Nghỉ' },
  resetDefault: { ko: '기본값', en: 'Default', vi: 'Mặc định' },
  saved: { ko: '저장했어요.', en: 'Saved.', vi: 'Đã lưu.' },

  sheetGuide1: {
    ko: '1인당 점심 예산은 {price}입니다. (예: 신청인 2인 시, {price} X 2명 = {p2}. 신청인 10인 시, {price} X 10명 = {p10})',
    en: 'The lunch budget is {price} per person. (e.g. 2 people: {price} × 2 = {p2}. 10 people: {price} × 10 = {p10})',
    vi: 'Ngân sách bữa trưa là {price} mỗi người. (vd: 2 người: {price} × 2 = {p2}. 10 người: {price} × 10 = {p10})',
  },
  sheetGuide2: { ko: '요리사는 예산에 맞추어 메뉴를 선정합니다.', en: 'The cook chooses the menu to fit the budget.', vi: 'Đầu bếp chọn thực đơn phù hợp với ngân sách.' },
  prevWeek: { ko: '이전', en: 'Prev', vi: 'Trước' },
  nextWeek: { ko: '다음', en: 'Next', vi: 'Sau' },
  thisWeek: { ko: '이번 주부터', en: 'From this week', vi: 'Từ tuần này' },
  colDate: { ko: '날짜', en: 'Date', vi: 'Ngày' },
  colPeople: { ko: '참석자', en: 'Attendees', vi: 'Người ăn' },
  colTotal: { ko: '총인원', en: 'Total', vi: 'Tổng' },
  colBudget: { ko: '예산', en: 'Budget', vi: 'Ngân sách' },
  menuTbd: { ko: '메뉴 미정', en: 'Menu TBD', vi: 'Chưa có thực đơn' },
  setMenu: { ko: '메뉴 등록', en: 'Set menu', vi: 'Nhập thực đơn' },
  edit: { ko: '수정', en: 'Edit', vi: 'Sửa' },
  save: { ko: '저장', en: 'Save', vi: 'Lưu' },
  menuPlaceholder: { ko: '메뉴 (예: 김치찌개, 계란말이)', en: 'Menu (e.g. kimchi stew, rolled omelette)', vi: 'Thực đơn (vd: canh kimchi, trứng cuộn)' },
  descPlaceholder: { ko: '설명 (선택)', en: 'Description (optional)', vi: 'Mô tả (không bắt buộc)' },
  mayChange: { ko: '{d} {h}:00 마감 · 아직 바뀔 수 있어요', en: 'Closes {d} {h}:00 · may still change', vi: 'Hạn {h}:00 {d} · có thể thay đổi' },
  noMealDays: { ko: '이 기간에 식사일이 없어요.', en: 'No lunch days in this period.', vi: 'Không có ngày ăn trong khoảng này.' },
  expensesTitle: { ko: '식비 지출 입력', en: 'Food expenses', vi: 'Chi phí ăn uống' },
  amount: { ko: '금액', en: 'Amount', vi: 'Số tiền' },
  memoPlaceholder: { ko: '메모 (예: 시장 장보기)', en: 'Note (e.g. market)', vi: 'Ghi chú (vd: đi chợ)' },
  expense: { ko: '지출', en: 'Expense', vi: 'Chi phí' },
  noExpenses: { ko: '최근 60일 지출이 없어요.', en: 'No expenses in the last 60 days.', vi: 'Không có chi phí trong 60 ngày qua.' },
  confirmDeleteExpense: { ko: '{d} {v} 지출을 지울까요?', en: 'Delete expense {v} on {d}?', vi: 'Xóa chi phí {v} ngày {d}?' },

  summaryTitle: { ko: '신청내용', en: 'Sign-ups', vi: 'Đăng ký' },
  summaryLegend: { ko: '● 신청한 날 · 휴일로 바뀐 날은 세지 않아요', en: '● signed up · holidays are not counted', vi: '● đã đăng ký · ngày nghỉ không được tính' },
  colMeals: { ko: '횟수', en: 'Meals', vi: 'Số bữa' },
  colNoShows: { ko: '노쇼', en: 'No-show', vi: 'Vắng' },
  guestRow: { ko: '손님', en: 'Guests', vi: 'Khách' },
  noData: { ko: '기록이 없어요.', en: 'No records.', vi: 'Chưa có dữ liệu.' },

  pastSignups: { ko: '지난 신청', en: 'Past sign-ups', vi: 'Đã đăng ký' },
  noShowTotal: { ko: '노쇼 (전체)', en: 'No-shows', vi: 'Vắng (tất cả)' },
  noShow90: { ko: '노쇼 (90일)', en: 'No-shows (90d)', vi: 'Vắng (90 ngày)' },
  notifications: { ko: '알림', en: 'Notifications', vi: 'Thông báo' },
  noNotifications: { ko: '알림이 없어요.', en: 'No notifications.', vi: 'Không có thông báo.' },
  myHistory: { ko: '내 신청 기록', en: 'My sign-ups', vi: 'Lịch sử đăng ký' },
  neverSigned: { ko: '아직 신청한 적이 없어요.', en: "You haven't signed up yet.", vi: 'Bạn chưa đăng ký lần nào.' },
  upcoming: { ko: '예정', en: 'Upcoming', vi: 'Sắp tới' },
  logout: { ko: '로그아웃 ({name})', en: 'Log out ({name})', vi: 'Đăng xuất ({name})' },
  language: { ko: '언어', en: 'Language', vi: 'Ngôn ngữ' },
  changeAdminPw: { ko: '관리자 비밀번호 변경', en: 'Change admin password', vi: 'Đổi mật khẩu quản trị' },
  changePwTitle: { ko: '비밀번호 정하기', en: 'Set your password', vi: 'Đặt mật khẩu' },
  changePwHint: {
    ko: '관리자 계정은 비밀번호로 들어와요. 본인만 아는 비밀번호를 정해 주세요. 임시 비밀번호를 받았다면 그걸 현재 비밀번호에 써 주세요.',
    en: 'Admin accounts sign in with a password. Choose one only you know. If you were given a temporary password, enter it as the current password.',
    vi: 'Tài khoản quản trị đăng nhập bằng mật khẩu. Hãy đặt mật khẩu chỉ bạn biết. Nếu được cấp mật khẩu tạm, nhập vào ô mật khẩu hiện tại.',
  },
  currentPw: { ko: '현재 비밀번호', en: 'Current password', vi: 'Mật khẩu hiện tại' },
  currentPwFirst: { ko: '현재 비밀번호 (처음 정하는 거면 비워 두세요)', en: 'Current password (leave empty if setting for the first time)', vi: 'Mật khẩu hiện tại (để trống nếu đặt lần đầu)' },
  newPw: { ko: '새 비밀번호 (4자리 이상)', en: 'New password (4+ characters)', vi: 'Mật khẩu mới (từ 4 ký tự)' },
  newPw2: { ko: '새 비밀번호 확인', en: 'Confirm new password', vi: 'Nhập lại mật khẩu mới' },
  pwMismatch: { ko: '새 비밀번호 확인이 달라요.', en: "The new passwords don't match.", vi: 'Mật khẩu mới không khớp.' },
  change: { ko: '변경', en: 'Change', vi: 'Đổi' },
  changed: { ko: '바꿨어요.', en: 'Changed.', vi: 'Đã đổi.' },
  pushPrompt: { ko: '신청 마감 알림을 휴대폰으로 받아보세요.', en: 'Get sign-up deadline reminders on your phone.', vi: 'Nhận nhắc hạn đăng ký trên điện thoại.' },
  pushTest: { ko: '시험 알림 보내기', en: 'Send a test', vi: 'Gửi thử' },
  pushTestSent: { ko: '1분 안에 이 휴대폰에 알림이 와야 해요. 앱을 닫아 두고 기다려 보세요.', en: 'A notification should arrive on this phone within a minute. Close the app and wait.', vi: 'Thông báo sẽ đến trong vòng 1 phút. Hãy đóng ứng dụng và chờ.' },
  pushServerNotReady: { ko: '서버 쪽 휴대폰 알림 설정이 아직 안 돼 있어요. 관리자에게 알려 주세요. (앱 안 알림은 여기서 볼 수 있어요)', en: 'Phone notifications are not set up on the server yet. Please tell an admin. (You can still see notifications here.)', vi: 'Máy chủ chưa cài thông báo điện thoại. Hãy báo quản trị viên. (Vẫn xem được thông báo tại đây.)' },
  pushDenied: { ko: '이 기기에서 알림이 차단돼 있어요. 휴대폰 설정 → 알림에서 이 앱(또는 브라우저)을 허용해 주세요.', en: 'Notifications are blocked on this device. Allow them in your phone settings → Notifications.', vi: 'Thông báo bị chặn. Hãy cho phép trong Cài đặt → Thông báo.' },
  pushOn: { ko: '휴대폰 알림이 켜져 있어요.', en: 'Phone notifications are on.', vi: 'Đã bật thông báo điện thoại.' },
  pushEnable: { ko: '알림 켜기', en: 'Turn on', vi: 'Bật' },
  pushReconnect: { ko: '다시 연결', en: 'Reconnect', vi: 'Kết nối lại' },
  pushDone: { ko: '이 기기에서 알림을 받아요.', en: 'This device will get notifications.', vi: 'Thiết bị này sẽ nhận thông báo.' },
  pushFail: { ko: '알림 설정 실패: {e}', en: 'Could not turn on notifications: {e}', vi: 'Không bật được thông báo: {e}' },
  installTitle: { ko: '앱으로 설치하기', en: 'Install the app', vi: 'Cài ứng dụng' },
  installBtn: { ko: '이 휴대폰에 앱 설치', en: 'Install on this phone', vi: 'Cài vào điện thoại này' },
  installSteps: {
    ko: '1. 카카오톡에서 다른 브라우저로 열기\n2. 다른 브라우저에서 연 후에 \'설정에서 앱 설치\' 혹은 \'홈 화면에 추가\'\n아이폰: Safari로 열기 → 아래 공유(□↑) 버튼 → \'홈 화면에 추가\'\n앱으로 사용하면 마감 알림을 받으실 수 있습니다.',
    en: '1. In KakaoTalk, open this link in another browser\n2. In that browser, choose "Install app" from the menu or "Add to Home Screen"\niPhone: open in Safari → Share (□↑) at the bottom → "Add to Home Screen"\nUse it as an app to get deadline notifications.',
    vi: '1. Trong KakaoTalk, mở liên kết bằng trình duyệt khác\n2. Trong trình duyệt đó, chọn "Cài đặt ứng dụng" trong menu hoặc "Thêm vào màn hình chính"\niPhone: mở bằng Safari → nút Chia sẻ (□↑) bên dưới → "Thêm vào MH chính"\nDùng như ứng dụng để nhận thông báo hạn đăng ký.',
  },
  openExternal: { ko: '다른 브라우저로 열기', en: 'Open in another browser', vi: 'Mở bằng trình duyệt khác' },
  bellLabel: { ko: '알림', en: 'Alerts', vi: 'Thông báo' },
  pushBarText: { ko: '🔔 마감 알림이 꺼져 있어요.', en: '🔔 Deadline alerts are off.', vi: '🔔 Thông báo hạn đang tắt.' },
  pushBarDenied: { ko: '🔔 알림이 차단돼 있어요. 휴대폰 설정 → 애플리케이션(앱) → TC 점심신청(또는 Chrome) → 알림을 허용해 주세요.', en: '🔔 Notifications are blocked. Allow them in phone Settings → Apps → TC Lunch (or Chrome) → Notifications.', vi: '🔔 Thông báo đang bị chặn. Hãy cho phép trong Cài đặt điện thoại → Ứng dụng → TC (hoặc Chrome) → Thông báo.' },
  pushBarIos: { ko: '🔔 아이폰은 Safari 공유(□↑) → 홈 화면에 추가 → 홈 화면 아이콘으로 열어야 알림을 켤 수 있어요.', en: '🔔 On iPhone, Safari Share (□↑) → Add to Home Screen, then open from the icon to turn on alerts.', vi: '🔔 Trên iPhone: Safari Chia sẻ (□↑) → Thêm vào MH chính, rồi mở từ biểu tượng để bật thông báo.' },
  promptTitle: { ko: '휴대폰 알림을 켤까요?', en: 'Turn on phone notifications?', vi: 'Bật thông báo điện thoại?' },
  promptBody: { ko: '신청 마감(목 17:40, 금 06:45, 금 15:00)을 알려 드려요. 다음 화면에서 "허용"을 눌러 주세요.', en: 'We remind you before the deadline (Thu 17:40, Fri 06:45, Fri 15:00). Tap "Allow" on the next screen.', vi: 'Nhắc hạn đăng ký (T5 17:40, T6 06:45, T6 15:00). Bấm "Cho phép" ở màn hình tiếp theo.' },
  promptIosTitle: { ko: '아이폰은 홈 화면에 추가해야 알림이 와요', en: 'On iPhone, add the app to your home screen for notifications', vi: 'Trên iPhone, hãy thêm vào màn hình chính để nhận thông báo' },
  promptIosBody: { ko: '1. Safari 아래쪽 공유 버튼(□↑)을 누르세요.\n2. "홈 화면에 추가"를 누르세요.\n3. 홈 화면에 생긴 아이콘으로 앱을 열면 알림 켜기 창이 떠요.', en: '1. Tap the Share button (□↑) at the bottom of Safari.\n2. Tap "Add to Home Screen".\n3. Open the app from the new home-screen icon and you will be asked to turn on notifications.', vi: '1. Bấm nút Chia sẻ (□↑) ở dưới Safari.\n2. Bấm "Thêm vào MH chính".\n3. Mở ứng dụng từ biểu tượng mới, sẽ có hỏi bật thông báo.' },
  tapHint: { ko: '흰색 날짜를 누르고 확인을 누르면 신청돼요. 신청한 날짜를 다시 누르고 취소를 누르면 취소돼요.', en: 'Tap a white date and press OK to book. Tap a booked date and press Cancel to cancel.', vi: 'Chạm ngày màu trắng rồi bấm OK để đăng ký. Chạm ngày đã đăng ký rồi bấm Hủy để hủy.' },
  savedCount: { ko: '{n}명으로 신청했어요.', en: 'Booked for {n}.', vi: 'Đã đặt {n} người.' },
  nowCount: { ko: '지금 {n}명', en: 'now {n}', vi: 'hiện {n}' },
  myCount: { ko: '내 신청', en: 'Mine', vi: 'Của tôi' },
  closedDay: { ko: '마감된 날이에요 ({d} {h} 마감)', en: 'Closed (deadline was {d} {h})', vi: 'Đã chốt (hạn {h} {d})' },
  closedShort: { ko: '마감', en: 'Closed', vi: 'Chốt' },
  pastDay: { ko: '지난 날이에요', en: 'This day has passed', vi: 'Ngày đã qua' },
  legendClosed: { ko: '마감', en: 'Closed', vi: 'Đã chốt' },
  historyTitle: { ko: '내역', en: 'History', vi: 'Lịch sử' },
  noBookings: { ko: '이 달 신청이 없어요.', en: 'No sign-ups this month.', vi: 'Tháng này chưa có đăng ký.' },
  personTotals: { ko: '이 달 사람별 합계', en: 'Totals by person this month', vi: 'Tổng theo người trong tháng' },
  monthTotal: { ko: '이 달 총 {n}명', en: '{n} meals this month', vi: 'Tổng {n} suất trong tháng' },
  reserved: { ko: '예약됨 ✓', en: 'Booked ✓', vi: 'Đã đặt ✓' },
  notReserved: { ko: '예약 안 함', en: 'Not booked', vi: 'Chưa đặt' },
  reserve: { ko: '예약하기', en: 'Book', vi: 'Đặt' },
  cancelReserve: { ko: '취소', en: 'Cancel', vi: 'Hủy' },
  didReserve: { ko: '{d} 예약했어요.', en: 'Booked {d}.', vi: 'Đã đặt {d}.' },
  guestCount: { ko: '손님', en: 'Guests', vi: 'Khách' },
  details: { ko: '오늘 신청자', en: 'Who signed up', vi: 'Người đăng ký' },
  logoutShort: { ko: '로그아웃', en: 'Log out', vi: 'Đăng xuất' },
  noticeTitle: { ko: '로그인 화면 공지', en: 'Login screen notice', vi: 'Thông báo màn hình đăng nhập' },
  noticeHint: { ko: '로그인 화면에 작게 보여요. 누구나 볼 수 있으니 비밀번호를 적으면 누구나 관리자로 들어올 수 있어요.', en: 'Shown in small text on the login screen. Anyone can see it, so a password written here lets anyone sign in as admin.', vi: 'Hiện chữ nhỏ ở màn hình đăng nhập. Ai cũng xem được, nên nếu ghi mật khẩu thì ai cũng vào được quyền quản trị.' },
  renamePrompt: { ko: '새 이름 (로그인할 때 이 이름을 써요)', en: 'New name (used to sign in)', vi: 'Tên mới (dùng để đăng nhập)' },
  rename: { ko: '이름 바꾸기', en: 'Rename', vi: 'Đổi tên' },
  confirmRemovePerson: { ko: '{d} {name} {n}명 신청을 삭제할까요?', en: 'Delete {name} ({n}) on {d}?', vi: 'Xóa {name} ({n} người) ngày {d}?' },
  later: { ko: '나중에', en: 'Later', vi: 'Để sau' },
  ok: { ko: '확인', en: 'OK', vi: 'OK' },
  pushIos: { ko: '아이폰은 Safari 공유 버튼 → "홈 화면에 추가"로 앱을 설치하면 휴대폰 알림을 받을 수 있어요.', en: 'On iPhone, use Safari Share → "Add to Home Screen" to install the app and get notifications.', vi: 'Trên iPhone, dùng Safari Chia sẻ → "Thêm vào MH chính" để cài ứng dụng và nhận thông báo.' },
  pushUnsupported: { ko: '이 브라우저는 휴대폰 알림을 지원하지 않아요. 알림은 이 화면에서 확인할 수 있어요.', en: "This browser doesn't support phone notifications. You can see them here.", vi: 'Trình duyệt này không hỗ trợ thông báo. Bạn có thể xem tại đây.' },

  adminUsers: { ko: '직원', en: 'People', vi: 'Nhân viên' },
  adminNoShows: { ko: '노쇼', en: 'No-shows', vi: 'Vắng' },
  adminBudget: { ko: '예산', en: 'Budget', vi: 'Ngân sách' },
  adminSettings: { ko: '설정', en: 'Settings', vi: 'Cài đặt' },
  adminAudit: { ko: '기록', en: 'Log', vi: 'Nhật ký' },
  staffCount: { ko: '직원 {n}명', en: '{n} people', vi: '{n} người' },
  usersHint: {
    ko: '전출 가면 "비활성"으로 바꾸세요. 잘못 만든 이름은 "삭제"하면 목록에서 없어지고, 신청 인원 기록은 그 이름으로 남아요.',
    en: 'When someone leaves, set them to "Inactive". "Delete" removes a mistaken name from this list; its bookings stay under that name.',
    vi: 'Khi ai đó chuyển đi, đặt "Ngừng". "Xóa" bỏ tên tạo nhầm khỏi danh sách; lượt đăng ký vẫn giữ dưới tên đó.',
  },
  colName: { ko: '이름', en: 'Name', vi: 'Tên' },
  colEats: { ko: '식사', en: 'Eats', vi: 'Ăn' },
  colCook: { ko: '요리사', en: 'Cook', vi: 'Bếp' },
  colAdmin: { ko: '관리자', en: 'Admin', vi: 'QT' },
  colStatus: { ko: '상태', en: 'Status', vi: 'Trạng thái' },
  active: { ko: '재직', en: 'Active', vi: 'Đang làm' },
  inactive: { ko: '비활성', en: 'Inactive', vi: 'Ngừng' },
  resetPw: { ko: '비번 초기화', en: 'Reset password', vi: 'Đặt lại MK' },
  confirmResetPw: { ko: '{name}님 비밀번호를 초기화할까요?', en: "Reset {name}'s password?", vi: 'Đặt lại mật khẩu của {name}?' },
  tempPwMsg: { ko: '{name}님 임시 비밀번호: {pw} (본인에게 직접 전달해 주세요.)', en: "{name}'s temporary password: {pw} (give it to them in person)", vi: 'Mật khẩu tạm của {name}: {pw} (hãy đưa trực tiếp)' },
  newStaffTitle: { ko: '새 직원 등록', en: 'New people', vi: 'Người mới' },
  newStaffHint: {
    ko: '새로 오신 분께 앱 주소만 알려 주세요. 이름만 쓰면 바로 등록돼요. 잘못 만든 이름은 "비활성"으로 바꾸면 돼요. 관리자만 비밀번호로 들어와요. 다른 사람을 관리자로 지정했다면 "비번 초기화"로 임시 비밀번호를 만들어 알려 주세요.',
    en: 'Just share the app link. Typing a name registers it. Set mistaken names to "Inactive". Only admins use a password; after making someone an admin, use "Reset password" to give them a temporary one.',
    vi: 'Chỉ cần gửi đường dẫn ứng dụng. Nhập tên là đăng ký. Tên nhập sai thì đặt "Ngừng". Chỉ quản trị viên dùng mật khẩu; sau khi cấp quyền quản trị, dùng "Đặt lại MK" để tạo mật khẩu tạm.',
  },
  noShowsTitle: { ko: '노쇼 현황', en: 'No-shows', vi: 'Tình hình vắng' },
  noShowsHint: { ko: '신청하고 출석 체크가 안 된 끼니예요. 착오가 있으면 달력에서 그날을 눌러 출석으로 바꿔 주세요.', en: 'Meals signed up for but not checked in. If wrong, open that day in the calendar and mark as eaten.', vi: 'Các bữa đã đăng ký nhưng không điểm danh. Nếu sai, mở ngày đó trên lịch và đánh dấu đã ăn.' },
  colSignups: { ko: '신청', en: 'Sign-ups', vi: 'Đăng ký' },
  col90: { ko: '90일', en: '90d', vi: '90 ngày' },
  budgetTitle: { ko: '식비 예산', en: 'Food budget', vi: 'Ngân sách ăn uống' },
  budgetHint: { ko: '기간별 총예산을 넣으면 맨 위에 총예산/사용/남은 예산이 보여요. 지출은 요리사 탭에서 입력해요.', en: 'Enter a budget per period to show budget / spent / remaining at the top. Expenses are entered in the Cook tab.', vi: 'Nhập ngân sách theo kỳ để hiển thị ở trên cùng. Chi phí nhập ở tab Bếp.' },
  budgetAmount: { ko: '예산', en: 'Budget', vi: 'Ngân sách' },
  memo: { ko: '메모', en: 'Note', vi: 'Ghi chú' },
  confirmDeleteBudget: { ko: '이 예산을 지울까요?', en: 'Delete this budget?', vi: 'Xóa ngân sách này?' },
  settingsTitle: { ko: '설정', en: 'Settings', vi: 'Cài đặt' },
  setDeadlineWeekday: { ko: '신청 마감 요일 (1=월 … 5=금): 이 요일에 다음 주 신청 마감', en: 'Deadline weekday (1=Mon … 5=Fri): next week closes on this day', vi: 'Thứ chốt (1=T2 … 5=T6): chốt tuần sau vào ngày này' },
  setDeadlineHour: { ko: '신청 마감 시각', en: 'Deadline hour', vi: 'Giờ chốt' },
  setMealPrice: { ko: '1인 점심 예산 (VND)', en: 'Lunch budget per person (VND)', vi: 'Ngân sách mỗi suất (VND)' },
  setAttendanceClose: { ko: '출석 체크 마감 시각 (이후 미체크는 노쇼)', en: 'Check-in closes at (unchecked = no-show)', vi: 'Hết giờ điểm danh (chưa điểm danh = vắng)' },
  setNoShowThreshold: { ko: '관리자에게 알릴 노쇼 횟수 (최근 90일)', en: 'Alert admins at this many no-shows (90 days)', vi: 'Báo quản trị khi vắng từ (90 ngày)' },
  setReminderHour: { ko: '마감 알림 시각 (목·금 오전)', en: 'Deadline reminder hour (Thu & Fri morning)', vi: 'Giờ nhắc hạn (sáng T5 & T6)' },
  setMaxGuests: { ko: '한 사람이 한 날짜에 신청할 수 있는 최대 인원', en: 'Max people one person can book per day', vi: 'Số người tối đa một người đăng ký mỗi ngày' },
  unitHour: { ko: '시', en: 'h', vi: 'giờ' },
  unitTimes: { ko: '회', en: 'times', vi: 'lần' },
  unitPeople: { ko: '명', en: 'people', vi: 'người' },
  auditTitle: { ko: '변경 기록', en: 'Change log', vi: 'Nhật ký thay đổi' },
  noAudit: { ko: '기록이 없어요.', en: 'No records.', vi: 'Chưa có.' },
  tzNote: { ko: '시간은 모두 베트남 시간 기준이에요.', en: 'All times are Vietnam time.', vi: 'Tất cả giờ theo giờ Việt Nam.' },

  // 앱에서 직접 내는 오류
  errNoConfig: { ko: 'Supabase 설정(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)이 없어요.', en: 'Supabase settings are missing.', vi: 'Thiếu cấu hình Supabase.' },
  errNameLen: { ko: '이름은 1~10자로 써 주세요.', en: 'Please enter a name of 1–10 characters.', vi: 'Tên dài 1–10 ký tự.' },
  errWrongAdminPw: { ko: '관리자 비밀번호가 틀렸어요.', en: 'Wrong admin password.', vi: 'Sai mật khẩu quản trị.' },
  errWrongLogin: { ko: '아이디 또는 비밀번호가 틀렸어요.', en: 'Wrong name or password.', vi: 'Sai tên hoặc mật khẩu.' },
  errRegister: { ko: '등록하지 못했어요. 이름이 10자를 넘거나 이미 있는 이름인지 확인해 주세요.', en: 'Could not register. The name may be too long or already taken.', vi: 'Không đăng ký được. Tên có thể quá dài hoặc đã tồn tại.' },
  errUnavailable: { ko: '관리자가 이 이름을 사용 중지해 두었어요. 관리자(TC)가 ⚙ → 직원에서 상태를 "재직"으로 바꾸면 들어올 수 있어요.', en: 'An admin has deactivated this name. The admin (TC) can turn it back on in ⚙ → People.', vi: 'Quản trị viên đã tắt tên này. Quản trị viên (TC) có thể bật lại trong ⚙ → Nhân viên.' },
  errCurrentPw: { ko: '현재 비밀번호가 틀렸어요.', en: 'The current password is wrong.', vi: 'Mật khẩu hiện tại sai.' },
  errNewPwLen: { ko: '새 비밀번호는 4자리 이상이에요.', en: 'The new password needs 4+ characters.', vi: 'Mật khẩu mới cần từ 4 ký tự.' },
  errNotFound: { ko: '없는 기능이에요.', en: 'Unknown action.', vi: 'Không có chức năng này.' },
  weekTotal: { ko: '합계', en: 'Total', vi: 'Tổng' },
  myGuestsOnDay: { ko: '내가 추가한 손님 {n}명', en: '{n} guest(s) added by me', vi: '{n} khách do tôi thêm' },
  guestsList: { ko: '손님 목록', en: 'Guest list', vi: 'Danh sách khách' },
  staffShort: { ko: '직원 {n}', en: '{n} staff', vi: '{n} NV' },
  guestsShort: { ko: '손님 {n}', en: '{n} guests', vi: '{n} khách' },

  // 알림 (DB에 종류와 값으로 저장된 것)
  n_menu: { ko: '{d} 메뉴: {title}', en: 'Menu for {d}: {title}', vi: 'Thực đơn {d}: {title}' },
  n_menuChanged: { ko: '{d} 메뉴 변경: {title}', en: 'Menu changed for {d}: {title}', vi: 'Đổi thực đơn {d}: {title}' },
  n_confirmed: { ko: '{d} 인원 확정: {total}명', en: '{d} confirmed: {total} people', vi: '{d} đã chốt: {total} người' },
  n_confirmedBody: { ko: '직원 {members}명 + 손님 {guests}명 · 예산 {budget}. 메뉴를 등록해 주세요.', en: '{members} staff + {guests} guests · budget {budget}. Please set the menu.', vi: '{members} nhân viên + {guests} khách · ngân sách {budget}. Vui lòng nhập thực đơn.' },
  n_remind: { ko: '내일 {h}시, 다음 주 점심 신청이 마감돼요', en: "Next week's lunch sign-up closes tomorrow at {h}:00", vi: 'Đăng ký bữa trưa tuần sau đóng lúc {h}:00 ngày mai' },
  n_remindToday: { ko: '오늘 {h}시, 다음 주 점심 신청이 마감돼요', en: "Next week's lunch sign-up closes today at {h}:00", vi: 'Đăng ký bữa trưa tuần sau đóng lúc {h}:00 hôm nay' },
  n_test: { ko: 'Thanh Cong Lunch 알림 시험', en: 'Thanh Cong Lunch test notification', vi: 'Thông báo thử Thanh Cong Lunch' },
  n_testBody: { ko: '이 알림이 보이면 휴대폰 알림이 잘 되는 거예요.', en: 'If you can see this, phone notifications work.', vi: 'Nếu bạn thấy thông báo này, thông báo điện thoại đã hoạt động.' },
  n_remindBody: { ko: '드실 날을 골라 신청해 주세요.', en: 'Please pick the days you will eat.', vi: 'Hãy chọn những ngày bạn sẽ ăn.' },
  n_noshow: { ko: '{d} 점심 노쇼로 기록됐어요', en: 'Marked as no-show for {d}', vi: 'Bị ghi vắng ngày {d}' },
  n_noshowBody: { ko: '신청하고 드시지 않았어요. 착오라면 요리사나 관리자에게 말해 주세요.', en: "You signed up but didn't check in. If this is wrong, tell the cook or an admin.", vi: 'Bạn đã đăng ký nhưng không điểm danh. Nếu nhầm, hãy báo đầu bếp hoặc quản trị viên.' },
  n_noshowAdmin: { ko: '{name}님 노쇼 {count}회 (최근 90일)', en: '{name}: {count} no-shows (90 days)', vi: '{name}: vắng {count} lần (90 ngày)' },
  n_noshowAdminBody: { ko: '기준 {threshold}회 이상이에요.', en: 'At or above the limit of {threshold}.', vi: 'Đạt ngưỡng {threshold} lần.' },
};

export const LANGS = [['ko', '한국어'], ['en', 'English'], ['vi', 'Tiếng Việt']];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function detectLang() {
  try {
    const saved = localStorage.getItem('tclunch.lang');
    if (saved && D.enter[saved]) return saved;
  } catch { /* 저장소를 못 쓰면 브라우저 언어로 */ }
  const nav = (navigator.language || 'en').slice(0, 2);
  return ['ko', 'vi'].includes(nav) ? nav : 'en';
}
export function saveLang(lang) {
  try { localStorage.setItem('tclunch.lang', lang); } catch { /* 무시 */ }
}

export function translate(lang, key, vars = {}) {
  const s = D[key]?.[lang] ?? D[key]?.en ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export const LangContext = createContext({ lang: 'en', setLang: () => {} });
export function useT() {
  const { lang } = useContext(LangContext);
  const t = (key, vars) => translate(lang, key, vars);
  t.lang = lang;
  return t;
}

export const weekdayNames = (lang) => translate(lang, 'weekdays').split(',');
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export function fmtDay(date, lang) {
  const [, m, d] = String(date).split('-');
  const wd = weekdayNames(lang)[weekdayOf(date)];
  return lang === 'vi' ? `${wd} ${Number(d)}/${Number(m)}` : lang === 'en' ? `${wd} ${Number(m)}/${Number(d)}` : `${Number(m)}/${Number(d)}(${wd})`;
}
export function monthTitle(month, lang) {
  const [y, m] = month.split('-');
  return translate(lang, 'monthTitle', { y, m: Number(m), mon: MONTHS_EN[Number(m) - 1] });
}
// 마감 일시 'YYYY-MM-DD HH:MM' → { d: 요일 붙은 날짜, h: 'HH:MM' }
export function deadlineParts(d, lang, fallbackHour = 17) {
  if (d.deadlineAt) return { d: fmtDay(d.deadlineAt.slice(0, 10), lang), h: d.deadlineAt.slice(11, 16) };
  return { d: fmtDay(d.deadline, lang), h: `${fallbackHour}:00` };
}
export const money = (n) => `VND ${Number(n || 0).toLocaleString('en-US')}`;

// DB가 보내는 한국어 오류 문구를 고른 언어로
const KO_DAY = /(\d+)\/(\d+)\(([일월화수목금토])\)/;
const SERVER = [
  [/^신청 마감됐어요\. \((.+)까지\)$/, { en: 'Sign-up is closed (deadline was {1}).', vi: 'Đã hết hạn đăng ký (hạn {1}).' }],
  [/^이날은 점심 운영을 하지 않아요\.$/, { en: 'No lunch on this day.', vi: 'Ngày này không có bữa trưa.' }],
  [/^마감 후에는 취소할 수 없어요/, { en: 'You can’t cancel after the deadline. Ask an admin if needed.', vi: 'Không thể hủy sau hạn. Hãy nhờ quản trị viên nếu cần.' }],
  [/^출석 체크는 식사 당일 (\d+)시 전까지만/, { en: 'Check-in is only possible on the day, before {1}:00.', vi: 'Chỉ điểm danh trong ngày, trước {1}:00.' }],
  [/^신청하지 않은 날이에요\.$/, { en: "You didn't sign up for this day.", vi: 'Bạn chưa đăng ký ngày này.' }],
  [/^본인이 추가한 손님만 지울 수 있어요\.$/, { en: 'You can only delete guests you added.', vi: 'Chỉ xóa được khách do bạn thêm.' }],
  [/^점심 신청 대상 계정이 아니에요\.$/, { en: 'This account does not eat lunch here.', vi: 'Tài khoản này không đăng ký ăn trưa.' }],
  [/^관리자만 할 수 있어요\.$/, { en: 'Admins only.', vi: 'Chỉ quản trị viên.' }],
  [/^요리사나 관리자만 할 수 있어요\.$/, { en: 'Cook or admin only.', vi: 'Chỉ đầu bếp hoặc quản trị viên.' }],
  [/^로그인이 필요해요\.$/, { en: 'Please sign in.', vi: 'Vui lòng đăng nhập.' }],
  [/^비활성화된 계정이에요\.$/, { en: 'This account is inactive.', vi: 'Tài khoản đã ngừng.' }],
  [/^메뉴를 입력해 주세요\.$/, { en: 'Please enter a menu.', vi: 'Vui lòng nhập thực đơn.' }],
  [/^금액을 확인해 주세요\.$/, { en: 'Please check the amount.', vi: 'Vui lòng kiểm tra số tiền.' }],
  [/^아직 식사일이 아니에요\.$/, { en: "It's not that day yet.", vi: 'Chưa đến ngày đó.' }],
  [/^요리사는 오늘과 어제 출석만/, { en: 'Cooks can only check in today and yesterday. Ask an admin for older days.', vi: 'Đầu bếp chỉ điểm danh hôm nay và hôm qua. Ngày trước đó hãy nhờ quản trị viên.' }],
  [/^기간이 겹치는 예산이 이미 있어요\.$/, { en: 'A budget already covers part of this period.', vi: 'Đã có ngân sách trùng khoảng thời gian này.' }],
  [/^본인의 관리자 권한은 스스로 해제할 수 없어요\.$/, { en: 'You can’t remove your own admin rights.', vi: 'Không thể tự gỡ quyền quản trị của mình.' }],
  [/^직원은 비밀번호 없이/, { en: 'Staff sign in with just their name. Only admin accounts have passwords.', vi: 'Nhân viên chỉ cần tên. Chỉ tài khoản quản trị có mật khẩu.' }],
];
export function translateServer(msg, lang) {
  // 손님 개념은 화면에 없으므로 '한 사람 최대 인원'으로 바꿔 보여 준다 (DB 한도는 본인 1명 + 손님 수)
  const max = msg && msg.match(/^손님 수는 1~(\d+)명이에요\.$/);
  if (max) return translate(lang, 'maxPeople', { n: Number(max[1]) + 1 });
  if (!msg || lang === 'ko') return msg;
  const toDay = (s) => s.replace(KO_DAY, (_, m, d, w) => fmtDay(`2000-${m.padStart(2, '0')}-${d.padStart(2, '0')}`.replace('2000', guessYear(m)), lang));
  for (const [re, tr] of SERVER) {
    const m = msg.match(re);
    if (m) return tr[lang].replace(/\{(\d)\}/g, (_, i) => toDay(m[Number(i)] || ''));
  }
  return msg;
}
// 'M/D(요일)'에는 연도가 없어서, 가까운 해로 맞춘다 (요일 표시용)
function guessYear(m) {
  const now = new Date();
  const y = now.getFullYear();
  return String(Number(m) < now.getMonth() - 5 ? y + 1 : y);
}

export function renderNotification(n, lang) {
  const p = n.params || {};
  const d = p.date ? fmtDay(p.date, lang) : '';
  switch (n.kind) {
    case 'menu': return { title: translate(lang, p.changed ? 'n_menuChanged' : 'n_menu', { d, title: p.title }), body: n.body };
    case 'confirmed': return {
      title: translate(lang, 'n_confirmed', { d, total: p.total }),
      body: translate(lang, 'n_confirmedBody', { members: p.members, guests: p.guests, budget: money(p.budget) }),
    };
    case 'remind': return { title: translate(lang, p.today ? 'n_remindToday' : 'n_remind', { h: p.hour }), body: translate(lang, 'n_remindBody') };
    case 'test': return { title: translate(lang, 'n_test'), body: translate(lang, 'n_testBody') };
    case 'noshow': return { title: translate(lang, 'n_noshow', { d }), body: translate(lang, 'n_noshowBody') };
    case 'noshow-admin': return {
      title: translate(lang, 'n_noshowAdmin', { name: p.name, count: p.count }),
      body: translate(lang, 'n_noshowAdminBody', { threshold: p.threshold }),
    };
    default: return { title: n.title, body: n.body };
  }
}

// 이름은 영어로만: 알파벳·숫자·공백·. - 만 남긴다
export const englishName = (v) => v.replace(/[^A-Za-z0-9 .\-]/g, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
