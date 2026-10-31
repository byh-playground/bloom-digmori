# 새 동료 3종 컷아웃 리그

**[브라우저로 보기](https://byh-playground.github.io/bloom-digmori/previews/unit-rig/)**

뿌리 · 바위 병아리 · 버섯 달팽이의 부품 PNG(`src/assets/units/`)를 제품 리그 `src/presentation/unit-rig.js`로 실행 중에 조립해 그리는 결정적 프리뷰입니다. 0.32.0에서는 리그와 에셋만 추가했고 게임 액터에는 아직 연결하지 않았습니다. 시뮬레이션·three.js·저장을 실행하지 않고 2D 캔버스에 같은 `UnitRig.draw`를 부릅니다.

종마다 다음을 한 화면에 보여 줍니다.

1. 시점 × 동작: 정면 · 옆면 · 반전 옆면 · 뒷면 × 종별 동작 전부(한 번 동작은 대표 순간).
2. 성장: 아기 · 등급 1–4 · 보스(×3 + 모자)를 같은 축척과 같은 바닥선에 나란히.
3. 등급 1–4 확대와 아기 · 보스 단독.
4. 표정 교체: 정면 · 옆면 × 표정 6종.
5. 동작 타임라인: 옆면, 진행 0 · .15 · .3 · .45 · .6 · .8.
6. 알(아이템·블록 아이콘용 원본 PNG).

주소 파라미터: `?species=root|rock-chick|mushroom-snail`(한 종만), `?bg=light|dark|green`(가장자리 확인용 배경), `?play=1`(시간을 흘려 재생). 재생하지 않으면 매번 같은 그림입니다.

## 실행

```sh
npm run dev
```

http://127.0.0.1:8000/bloom-digmori/previews/unit-rig/ 를 엽니다. 빌드가 없고 Pages도 같은 파일을 그대로 배포합니다. `npm run test:unit-rig`가 이 페이지를 0 오류로 열고 모든 종·시점·동작·표정을 그리는지 확인합니다.
