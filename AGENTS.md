# Digmori 작업 지침

- README에 연결된 bloom-reference 공통 개발·관리 규칙을 기준으로 작업한다.
- src/와 src/order.json이 소스 SSOT다. dist/는 빌드 산출물이며 직접 수정하거나 커밋하지 않는다.
- 원본 기능 경계별 파일은 빌드 시 단일 ESM 스코프에 조립된다. 모듈 순서를 바꾸면 초기화 의존성을 확인한다.
- 신규 기능이나 대규모 리팩터링은 초기 이관 범위에 포함하지 않는다.
- 벡터 아트는 원본 SVG를 Pages에 바이트 단위로 배포한다. 고정 GameKit 시작 로더에서 SHA·크기·곡선 세그먼트를 확인하고 1회 컴파일/cache한 뒤 공통 WebGL 메시 API로 월드에 직접 그린다. SVG를 빌드 때 프레임별 캔버스/텍스처 아틀라스나 IIFE로 변환해 HTML에 굽지 않는다.
- 나쁜 사례(0.28.10–0.28.12 조약돌 두더지): build script가 SVG를 컴파일하고 offscreen Canvas로 애니메이션 프레임을 굽고 `drawImage`로 atlas를 만든 뒤 WebGL 텍스처로 옮겼다. 이로써 원본과 파생 그림이 중복되고 실제 월드 깊이/메시 렌더링을 얻지 못했으므로 재도입하지 않는다.
- 브랜딩 변경과 저장 계약을 분리한다. 기존 저장 키를 무작정 바꾸거나 데이터를 삭제하지 않는다.
- npm run build 후 npm test로 실제 SDK를 사용하는 고정 사용자 흐름을 검증한다. 전체 180초 상한 및 영구 E2E 정책은 공통 규칙을 따른다.
- PR에서 CI·실제 실행 검증을 확인하고 main에 머지한다. Pages build.json의 commit·HTML SHA를 공개 파일과 대조한다.

