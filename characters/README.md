# 벙참 공용 캐릭터 카드

벙참 게임에 나오는 캐릭터는 이 카드 12명이 공식이에요. 어느 계정의 Claude가 새 게임을 만들거나 기존 게임을 고칠 때도, 캐릭터 이름·얼굴·말투·대사는 이 폴더를 그대로 따라요.

- 카드 보기: https://vino94-s.github.io/vino_is_best/characters/
- 데이터: [`characters.json`](characters.json) (사람·프로그램 모두 읽기 쉬운 원본)
- 바로 쓰는 스크립트: [`bung-chars.js`](bung-chars.js)
- 얼굴 그림(배경 없는 PNG): [`img/`](img/)
- 출처: 손모가지 조심! (`gostop/js/characters.js`)의 캐릭터와 대사

## 12명

| id | 이름 | 정체 | 인사 | 말투 |
|---|---|---|---|---|
| eomji | 엄지 | 엄지손가락 | 따봉! | 따봉·엄지척·노따봉, 말끝 ~잉 |
| yeoni | 여니 | 하얀 강아지 | 끄응… | 소심한 말줄임표, “미안… 근데 안 미안” |
| yeongjun | 영준 | 빨간 새 | 만세! 짹짹! | 만세 + 말끝 “짹!” |
| yongwang | 용왕 | 바다의 왕 할아버지 | 에헴! | 사극체: 과인, ~노라, 여봐라, 어허 |
| juntak | 준탁 | 모자 쓰고 장미 문 신사 | 네 아가씨 | “네 아가씨”, “실례지만…” 깍듯한 존댓말 |
| haetsal | 햇살 | 해님 | 안물안궁? ㅇㅋ | 시크한 초성 반말, ㅋ, ~셈 |
| goran | 고란 | 침 흘리는 주황 토끼 | 주르륵… | 츄릅·주르륵, 전부 음식 비유 |
| kkaegul | 깨굴 | 개구리 | 깨굴! | 말끝 “~굴”, 깨굴깨굴, 올챙이 드립 |
| mandu | 만두 | 베이지 고양이 | 냥~ 엄지척 | 말끝 “~냥”, 하악, 츄르·낮잠 |
| myongradak | 묭라닥 | 닭 | 꼬끼오! | 꼬끼오·꼬꼬댁, 치킨·양념 드립 |
| bongchum | 봉춤 | 치와와 | 왈왈! | 왈왈!! 느낌표 연타, 지면 깨갱 |
| bino | 비노 | 무표정 얼굴 | … | “……” 또는 (괄호 속 행동) |

## 규칙

1. 이름과 id는 바꾸지 않아요. 다른 표기(예: 봉춘, 고라니, 묭, 따봉이)도 쓰지 않아요.
2. 얼굴은 `img/<id>.png`만 써요. 새로 그리거나 다른 그림으로 바꾸지 않아요.
3. 대사는 `lines`(어느 게임에나 쓰는 공용 대사)를 먼저 쓰고, 게임에 맞는 새 대사가 필요하면 그 캐릭터의 `voice`(말버릇) 규칙을 지켜서 만들어요.
4. 공용 대사 상황: `start` 시작 · `good` 잘했을 때 · `bad` 실수 · `win` 승리 · `lose` 패배 · `taunt` 도발. 고스톱 전용 대사는 `gostop`에 그대로 있어요.
5. 캐릭터나 대사를 바꿀 땐 이 폴더를 먼저 고치고, 그다음 각 게임에 반영해요.

## 게임에서 쓰는 법

이 저장소 안의 게임(GitHub Pages)이라면:

```html
<script src="../characters/bung-chars.js"></script>
<script>
  const c = BUNG_CHARS.get('kkaegul');      // 캐릭터 정보
  img.src = BUNG_CHARS.img('kkaegul');      // 얼굴 그림 주소
  say(BUNG_CHARS.line('kkaegul', 'win'));   // "깨굴깨굴~ 집으로 점프해라굴!" 등에서 하나
  BUNG_CHARS.list.forEach(...)              // 12명 전체
</script>
```

다른 곳에서는 `https://vino94-s.github.io/vino_is_best/characters/characters.json`을 읽거나, 그림은 `https://vino94-s.github.io/vino_is_best/characters/img/<id>.png` 주소로 써요. claude.ai 아티팩트처럼 바깥 주소를 못 읽는 곳에서는 `characters.json` 내용과 그림을 페이지 안에 직접 넣어요.
