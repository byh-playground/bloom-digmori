# GameKit 갱신 — 0.27.0

## 계약과 범위

- GameKit [PR44](https://github.com/byh-playground/bloom-gamekit/pull/44), source `fbecfb6c06a5be98af9f6f556b322e7247df57ca`, dist `7cf67c33451848d1af4a7b003cbe1b81ffef8b53`. [정상 배포](https://github.com/byh-playground/bloom-gamekit/actions/runs/38371460659)와 배포 manifest 및 실제 CDN 7개 모듈 SHA를 대조했다.
- 네트워크 protocol 1→3 변경 때문에 게임 MINOR를 0.27.0으로 올렸다. 협동 상대도 같은 버전이어야 한다. snapshotVersion은 0.26.0으로 유지하며 실제 0.26.0 저장을 복원했다. 월드 생성, 게임 규칙, Rapier, 저장 키는 변경하지 않는다.
- 실제 사용하는 RoomSession/createLoop/명령 및 availability 복귀 API는 기존 어댑터와 호환되어 새 래퍼가 필요하지 않았다. createLoop가 RoomSession.submitInput capability를 사용하며 명령은 기존 getInput packet 한 경로에서 전달된다. 단독 고정 40 TPS, 온라인 lockstep 40 TPS, 자체 렌더 보간을 유지한다.
- LocalInputPreview와 PresentationRuntime는 사용하지 않는다. PR44의 isActive/active를 억지로 연결하지 않았으며 SDK 교체를 예측 성능 개선으로 간주하지 않는다. 새로고침 identity resume도 별도 제품 기능으로 추가하지 않았다.
- 진단 화면의 SDK SHA를 src/core/config.js→빌드 placeholder로 연결하여 runtime pin과 중복된 상수를 제거했다. manifest 해시 및 사용 모듈 선언 비교를 기존 E2E에 포함했다.

## 실제 검증

[정리된 결과](verification-gamekit-0.27.0.json)

- Edge 155.0.4283.45, 단독 E2E 22.136초 PASS: 새 게임→이동→채굴·회수·설치→저장·새로고침·복원→자연 동굴 진입. SDK mock 없음.
- 2개 독립 브라우저 context가 실제 공개 Nostr relay와 WebRTC, 현재 앱 UI로 입장했다. 양쪽 이동 후 게스트 Q 명령을 보낸 상태에서 게스트 시뮬레이션 스케줄러를 5초 중단하는 fixture를 사용했다. 복귀 후 epoch 3에서 활성 명단 2인과 진행 회복, 공통 완료 틱 체크포인트 8개의 상태 해시 일치, 정상 퇴장 후 게스트 개인 월드와 호스트 1인 명단 복원. 22.522초 PASS. 게임/SDK는 실제 구현이며 중단 fixture만 검증용이다.
- 공개 0.26.0에서 생성한 42920바이트 저장을 새 빌드의 파일 가져오기 UI로 복원했다. seed·위치·편집 상태와 snapshot 0.26.0 확인. 변환 어댑터 없음.
- 초기에 기존 E2E의 게임/저장 버전 동일 가정과 채굴 후 원래 칸으로 설치한다는 조준 가정을 수정했다. 실제 설치 직전 조준 칸과 배치 결과를 비교한다. CDP freeze 요청만으로는 RTC 탭의 세션 중단이 확인되지 않아 그 결과를 복귀 성공으로 세지 않고 위 스케줄러 중단으로 확인했다.

## 한계

같은 PC의 실제 RTC이며 외부 NAT·TURN·실물 모바일·장기 세션 부하·전체 전투 조합은 미검증이다. relay 가용성은 외부 환경에 의존한다. Pages 배포 commit·HTML SHA와 공개 URL 결과는 이번 PR에 기록한다.
