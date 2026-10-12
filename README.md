# 디그모리 · Digmori

2.5D 세계에서 탐험하고, 자원을 채굴하고, 건설하는 샌드박스 게임입니다. 이관 기준 후보는 Bloom Sandbox 0.25.0이며 동굴, 6방 던전, 봉인 보물함, 수호체, XP·레벨·스탯, 모험창을 포함합니다.

**현재 상태: 초기 구성 Candidate. 원본 파일 전송이 막혀 게임은 아직 들어오지 않았고 실행·배포도 완료되지 않았습니다.**

## 실행

예정 실행 주소: https://byh-playground.github.io/bloom-digmori/ (아직 배포되지 않음).

원본 이관 후 생성되는 `dist/index.html`이 단일 HTML 실행 산출물입니다. 외부 GameKit·물리 SDK 로딩을 위한 인터넷 연결이 필요합니다. 직접 file:// 실행 지원 여부는 원본 확보 후 확인합니다.

## 조작

원본 검증 문서에서 확인한 키는 F 상호작용, E 가방, J 모험창입니다. PC 이동·채굴·설치와 모바일 터치 조작의 정확한 매핑은 원본 UI/입력 코드를 확인한 후 문서화합니다. 모바일 가로 844×390 에뮬레이션 기록은 있으나 실제 기기 검증은 아닙니다.

## 로컬 개발·빌드

필요 도구: Git, Node.js 22, Python 3.13.

```sh
git clone https://github.com/byh-playground/bloom-digmori.git
cd bloom-digmori
node scripts/build.mjs
python -m http.server 8000 --directory dist
```

현재는 원본 `src/game.mjs`와 `build.py`가 없어 빌드가 명시적으로 실패합니다. 빈 페이지를 정상 빌드로 처리하지 않습니다.

원본 ZIP의 모듈별 계층과 빌더를 확인해 가져온 후, 원본 빌더가 루트 `index.html`을 생성하도록 빌드 연결을 확정합니다. 편집 원본은 `src/`와 `build.py`, 루트 `index.html`과 `dist/`는 재생성 산출물이며 직접 수정하거나 커밋하지 않습니다. 게임 로직을 README나 빌드 스크립트에 복제하지 않습니다.

## 기술 구성과 배포

- 원본 보고 기준: Rapier deterministic compat 0.21.0, GameKit dist `87cac89042256297c025e880aa70ad9cd25ef8ab`.
- 이 SHA는 원본 검증 문서의 선언이며 실제 배포 SDK 파일/API 연결은 아직 미검증입니다. 원본 import와 실제 CDN을 대조해야 합니다.
- `scripts/build.mjs`: 원본 빌더 실행, 단일 HTML과 배포 provenance 생성.
- `.github/workflows/pages.yml`: PR 빌드 확인, main 빌드 후 Pages Actions 자동 배포.
- `dist/build.json`: 배포 Git SHA, HTML SHA-256, 버전, GameKit SHA, UTC 빌드 시각.
- 현재 원본 검증 기록은 실제 GameKit 대신 시험용 API를 사용했습니다. 이를 SDK 통합 PASS로 간주하지 않습니다.

## 버전·저장 호환

기준 게임 버전과 snapshotVersion은 모두 **0.25.0**입니다. 이전 0.21 저장 및 0.24.x 포맷과 호환되지 않으므로 **새 월드가 필요합니다**. 이전 저장을 자동 변환하는 어댑터나 임의 삭제 기능을 추가하지 않습니다. 브랜딩 변경만으로 저장 키/직렬화 포맷을 바꾸지 않습니다. 배포 URL이 달라지면 브라우저 저장 출처도 달라질 수 있습니다.

## 검증 범위

이 저장소의 실제 게임 검증은 아직 수행되지 않았습니다. 원본 보고의 시험 환경 결과와 이관 후 실측은 별도로 기록합니다.

승격 전 필수: 실제 Chromium/Edge에서 정적 배포 경로의 부팅 → 새 게임 → 이동 → 채굴/설치 → 저장/새로고침/복원, 실제 고정 SDK 요청·JS 오류 확인. main 및 공개 build.json의 Git SHA와 실제 index.html SHA-256 일치를 확인합니다.

외부 NAT를 통과하는 멀티플레이, 실기기 모바일, 장기 밸런스/성능은 별도 미검증 범위입니다.

## 개발 규칙·권리

[공통 개발 규칙](https://github.com/byh-playground/bloom-reference/blob/76625d708de290134973758d5a62b3900bc291ba/rules/development.html)과 [프로젝트 관리·검증 정책](https://github.com/byh-playground/bloom-reference/blob/76625d708de290134973758d5a62b3900bc291ba/rules/project-management.html)을 따릅니다.

참고 프로젝트 bloom-bounko는 공개 저장소이지만 LICENSE를 지정하지 않았습니다. 공개 여부를 재배포 허가로 해석하지 않으며 이 저장소에 임의의 오픈소스 라이선스를 부여하지 않습니다. 원본 및 SDK의 라이선스 고지는 원본 확보 후 확인·보존합니다.

