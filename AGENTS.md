# Digmori 작업 지침

- README에 연결된 bloom-reference 공통 개발·관리 규칙을 기준으로 작업한다.
- 루트 index.html과 src/가 직접 실행·배포되는 원본이다. 별도 빌드·번들·생성 HTML을 만들지 않는다.
- index.html은 원본 CSS와 순서 있는 defer classic script를 직접 읽는다. 각 JS의 strict mode와 공유 lexical scope를 유지하고 script 순서 변경 시 초기화 의존성을 확인한다. SDK dynamic import는 고정 ESM을 유지한다.
- 이미 만든 마크형 시스템(지형 생성·채굴·건축·인벤토리·제작·동료·전투)은 보존한다. 새 렌더링(three.js)과 새 캐릭터는 기존 게임 위에 얹고, 레거시 코드(자체 WebGL 렌더러, Rapier, 옛 캐릭터 아트)는 리팩터링으로 단계적으로 교체한다. 구 구현은 새 구현이 같은 기능을 갖추고 검증된 뒤에만 fallback 없이 지운다. 게임 기능을 통째로 지우는 변경은 사용자 확인 없이 하지 않는다.
- 캐릭터·무기·이펙트 아트는 저작한 래스터 원본 PNG를 `src/assets/`에 두고 Pages에 바이트 단위로 배포한다. 캐릭터는 부품(머리·몸통·손·발·장비·무기·표정 머리) PNG를 런타임에 조립해 움직이고(컷아웃 애니메이션), 장비 단계는 같은 부품의 색 치환으로 표현한다. 빌드 때 프레임·아틀라스를 굽거나 PNG를 재인코딩하지 않는다.
- 3D 월드·캐릭터 렌더는 three.js(고정 버전 ESM)로 한다. GameKit은 2D에 맞는 곳(정수 결정론 코어, 락스텝, UI, 입력, 저장, 진단)에만 쓰고 3D 렌더 기능을 GameKit에 추가하지 않는다.
- 나쁜 사례(0.28.10–0.28.12 조약돌 두더지): build script가 SVG를 컴파일하고 offscreen Canvas로 애니메이션 프레임을 굽고 `drawImage`로 atlas를 만든 뒤 WebGL 텍스처로 옮겼다. 이로써 원본과 파생 그림이 중복되고 실제 월드 깊이/메시 렌더링을 얻지 못했으므로 재도입하지 않는다.
- 브랜딩 변경과 저장 계약을 분리한다. 기존 저장 키를 무작정 바꾸거나 데이터를 삭제하지 않는다.
- 빌드 없이 npm test로 실제 SDK를 사용하는 고정 사용자 흐름을 검증한다. 전체 180초 상한 및 영구 E2E 정책은 공통 규칙을 따른다.
- PR에서 CI·실제 실행 검증을 확인하고 main에 머지한다. Pages Actions run의 commit과 source-hashes artifact를 공개 index.html·JS·CSS·PNG 파일에 대조한다.


