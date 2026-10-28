# 캐릭터 시트

**[바로 보기](https://htmlpreview.github.io/?https://github.com/byh-playground/bloom-digmori/blob/main/previews/character-sheet/index.html)** · [Pages에서 열기](https://byh-playground.github.io/bloom-digmori/previews/character-sheet/)

이미지 생성 AI가 같은 캐릭터를 매번 다르게 그리는 문제를 줄이려고, 캐릭터 1종의 시점별 외형과 색을 한 장에 고정한 참조 이미지를 만든다. 시트는 원본 SVG에서 매번 계산한다. 색·시점·부품을 이 폴더에 복사해 두지 않으므로 SVG를 고치면 시트도 같이 바뀐다.

## 읽는 원본

| 캐릭터 | 원본 | 시점 |
| --- | --- | --- |
| sprout (플레이어) | `src/assets/characters/sprout.svg` | 정면, 앞 3/4, 측면, 뒤 3/4, 후면 |
| bee, bug, flower, fungus (야생 종) | `src/assets/characters/*.svg` | 위와 같음 |
| pebble-mole (동료) | `src/assets/companions/pebble-mole.svg` | 정면, 후면 |

시점은 SVG `metadata`의 `expressions`(`show`/`hide` 그룹)를 그대로 적용해 그린다. 시점 이름(정면·측면 등)은 `index.html`의 `VIEW_LABELS` 한 곳에서만 정의한다.

## 화면 구성

1. **시트 이미지:** 시점 칸, 윤곽선 색, 팔레트 HEX와 채움/선 구분.
2. **프롬프트:** 참조 이미지를 붙이고 `{포즈}` `{시점}` `{배경}` 세 칸만 바꾸는 템플릿. 고정 항목(HEX, 윤곽선, 비율)과 금지 항목이 SVG에서 계산되어 들어간다.
3. **색 사용처·부품·동작:** 색별 사용 그룹, 부품 id·부모·피벗, 동작(clip) 이름과 길이.

`시트 PNG 저장`은 화면의 시트 이미지와 같은 SVG를 1408px 너비 PNG로 저장한다.

## 사용 순서

1. 캐릭터를 고르고 `시트 PNG 저장`.
2. 이미지 생성 AI에 PNG를 참조 이미지로 첨부하고 프롬프트를 붙여넣는다.
3. 빈칸 세 개만 채워 요청한다. 외형 묘사는 다시 쓰지 않는다.

## 실행

```sh
npm run dev
```

http://127.0.0.1:8000/bloom-digmori/previews/character-sheet/ 를 연다. 별도 빌드가 없고 `index.html` 하나가 원본 SVG를 `fetch`로 읽는다. 같은 출처에서 읽지 못하면(htmlpreview 등) `raw.githubusercontent.com`의 main 브랜치 SVG를 읽는다. `file://` 직접 실행은 지원하지 않는다.

## 범위

- 시점은 SVG에 있는 것만 그린다. pebble-mole은 정면·후면 2개뿐이라 측면 참조가 없다.
- 시트는 외형·색 고정용이다. 포즈별 참조는 포함하지 않는다.
- 이미지 생성 모델이 참조 이미지를 얼마나 따르는지는 모델마다 다르며 이 폴더에서 검증하지 않는다.
