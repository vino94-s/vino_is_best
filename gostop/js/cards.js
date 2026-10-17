// 화투 48장 + 보너스피 2장 정의
export const MONTHS = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란', '홍싸리', '공산', '국화', '단풍', '오동', '비'];
export const MONTH_ICON = ['', '🌲', '🌸', '🌺', '🌿', '🪻', '🌹', '🍂', '🌕', '🌼', '🍁', '🌳', '☔'];

// [월, 종류, 옵션]
const DEF = [
  [1, 'gwang', { name: '학', icon: '🕊️' }], [1, 'tti', { ribbon: 'hong' }], [1, 'pi'], [1, 'pi'],
  [2, 'yeol', { godori: true, name: '꾀꼬리', icon: '🐦' }], [2, 'tti', { ribbon: 'hong' }], [2, 'pi'], [2, 'pi'],
  [3, 'gwang', { name: '벚꽃막', icon: '🎪' }], [3, 'tti', { ribbon: 'hong' }], [3, 'pi'], [3, 'pi'],
  [4, 'yeol', { godori: true, name: '두견새', icon: '🐦‍⬛' }], [4, 'tti', { ribbon: 'cho' }], [4, 'pi'], [4, 'pi'],
  [5, 'yeol', { name: '다리', icon: '🌉' }], [5, 'tti', { ribbon: 'cho' }], [5, 'pi'], [5, 'pi'],
  [6, 'yeol', { name: '나비', icon: '🦋' }], [6, 'tti', { ribbon: 'chung' }], [6, 'pi'], [6, 'pi'],
  [7, 'yeol', { name: '멧돼지', icon: '🐗' }], [7, 'tti', { ribbon: 'cho' }], [7, 'pi'], [7, 'pi'],
  [8, 'gwang', { name: '보름달', icon: '🌕' }], [8, 'yeol', { godori: true, name: '기러기', icon: '🪿' }], [8, 'pi'], [8, 'pi'],
  [9, 'yeol', { gukjin: true, name: '국진', icon: '🍶' }], [9, 'tti', { ribbon: 'chung' }], [9, 'pi'], [9, 'pi'],
  [10, 'yeol', { name: '사슴', icon: '🦌' }], [10, 'tti', { ribbon: 'chung' }], [10, 'pi'], [10, 'pi'],
  [11, 'gwang', { name: '봉황', icon: '🦚' }], [11, 'pi', { val: 2 }], [11, 'pi'], [11, 'pi'],
  [12, 'gwang', { rain: true, name: '비광', icon: '☂️' }], [12, 'yeol', { name: '제비', icon: '🐦' }], [12, 'tti', { ribbon: 'bi' }], [12, 'pi', { val: 2 }],
];

export const CARDS = {};
const counter = {};
for (const [m, type, opt = {}] of DEF) {
  counter[m] = (counter[m] || 0) + 1;
  const id = `${String(m).padStart(2, '0')}${'abcd'[counter[m] - 1]}`;
  CARDS[id] = { id, month: m, type, val: type === 'pi' ? (opt.val || 1) : 0, ...opt };
}
CARDS.B2 = { id: 'B2', month: 0, type: 'pi', val: 2, bonus: true, name: '보너스 쌍피' };
CARDS.B3 = { id: 'B3', month: 0, type: 'pi', val: 3, bonus: true, name: '보너스 쓰리피' };

export const BASE_IDS = Object.keys(CARDS).filter(id => !CARDS[id].bonus);
export const BONUS_IDS = ['B2', 'B3'];
export const card = id => CARDS[id];
export const RIBBON_NAME = { hong: '홍단', chung: '청단', cho: '초단', bi: '띠' };
export const DAN_SETS = {
  hong: ['01b', '02b', '03b'],
  chung: ['06b', '09b', '10b'],
  cho: ['04b', '05b', '07b'],
};
export const GODORI = ['02a', '04a', '08b'];
