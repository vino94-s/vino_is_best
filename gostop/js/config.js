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
export const POINT_VALUES = [50, 100, 500]; // 점당 금액 선택지

// 3) 어드민
//  - revealKey: 이 주소로 한 번 들어오면 그 기기에서만 '어드민계정 로그인' 버튼이 보여요.
//      https://<주소>/gostop/?owner=pdnyc4xjerpx
//  - passwordSha256: 어드민 비밀번호의 SHA-256 해시 (비밀번호 원문은 저장하지 않아요)
export const ADMIN = {
  revealKey: 'pdnyc4xjerpx',
  passwordSha256: '713688ae63ee6e422b7dbe78f4d8fbc7289172126e04b143d33d59850375d6f1',
};

// 4) 온라인 대결에서 차례가 오래 멈추면 자동으로 대신 내는 시간(초)
export const TURN_TIMEOUT_SEC = 40;
