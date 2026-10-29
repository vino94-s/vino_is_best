// ───────── 손모가지 조심! 설정 ─────────

// 1) Firebase Realtime Database 설정 (README의 "Firebase 연결" 참고)
//    비워 두면 온라인 대결 없이 이 브라우저에만 저장되는 모드로 동작해요.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCMl9Ukya3XqIV0BHjKTx1mryvUru0kYXA',
  authDomain: 'gostop-7c4a2.firebaseapp.com',
  databaseURL: 'https://gostop-7c4a2-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'gostop-7c4a2',
  appId: '1:686060440785:web:d5f6445e4bcd2a481b89f0',
};

// 2) 게임머니
export const START_MONEY = 50000;   // 가입 시 지급
export const DAILY_CHARGE = 50000;  // 하루 1번(한국 시간 자정 기준) 첫 로그인 때 충전
export const FREE_CHARGE = { amount: 1000000, perDay: 10 }; // 0원이 되면 '해장국' 무료 충전 (한국 시간 하루 횟수)
export const POINT_VALUES = [50, 100, 500, 1000, 5000, 10000, 50000, 100000]; // 점당 금액 선택지

// 3) 운영자 전용 (주소·비밀번호는 운영자만 알고 있어요)
export const ADMIN = {
  revealKey: 'pdnyc4xjerpx',
  passwordSha256: '713688ae63ee6e422b7dbe78f4d8fbc7289172126e04b143d33d59850375d6f1',
};

// 4) 개인코드 기록용 구글 시트 Apps Script 웹 앱 주소 (비워 두면 기록 안 함)
export const SHEET_API = 'https://script.google.com/macros/s/AKfycbzVezMHgK0iYp5gQXgqPTSn8sm5_DP_E_Z75kWjLsO2ye1isvzGm_3F5A352ztiRm3P/exec';

// 5) 온라인 대결에서 차례가 오래 멈추면 자동으로 대신 내는 시간(초)
export const TURN_TIMEOUT_SEC = 40;
