# 0.28.1 표시 프레임 통합

GameKit [PR #46](https://github.com/byh-playground/bloom-gamekit/pull/46)의 공식 RenderObject / PresentationRuntime.frame() 계약을 실제 Digmori 렌더 경로에 적용한다. dist는 e108fe481aa7314974c39974a169b549500bf12c, source는 2712703c83923f16bb70454ea60e2ac533489ef8이다. manifest와 사용하는 8개 모듈의 SHA-256을 확인했다. 단독 시작은 6개, 온라인 transport/rollback은 입장 시 로드한다. pin/hash는 감사 및 E2E 검증 정보이며 런타임은 고정 CDN ESM을 직접 import한다.

## 표시 계약

- src/presentation/scene.js가 완료된 시뮬레이션 틱을 capture한다. actor/drop/shot ID와 객체 교체 시 증가하는 generation, 전체 생존 목록을 전달한다. 표시 중 제거 시점은 공식 프레임의 생존 목록을 따른다.
- rAF마다 frame()을 한 번 만들고 그 프레임의 forEach 모델을 렌더러에 전달한다. 몸체·장비·연속 효과·카메라·월드 체력 HUD는 같은 표시 위치를 사용한다. 프레임 모델을 다음 프레임까지 보관하거나 변경하지 않는다.
- 위치는 POSITION, 실제 facing에서 얻은 yaw는 ANGLE, pitch/애니메이션/행동 경과는 LINEAR다. combat 상태/액션 sequence 및 채굴 대상은 STATE_KEY로 경계 이전 값을 섞지 않는다. HP·아이템·상태는 STEP, 남은 반응 시간은 COUNTDOWN_MS다.
- 1틱(약 33.3ms) 지연 보간이며 기존 previous/current renderPosition 구현을 제거했다. 새로 관측한 이동 객체에는 이전 위치가 있을 때 initialSource를 제공한다. 작은 순간이동도 previous와 마지막 완료 위치의 불연속으로 명시하며 큰 이동은 snapDistance 8m를 적용한다.
- 새 월드·불러오기·입장/퇴장·membership·rollback에서 표시 revision을 재설정한다. 기존 confirmed journal과 rollback 이벤트 브리지는 유지한다.

## 판정과 표시의 경계

Rapier body/world/handle, voxel edit, terrain/water mesh revision, 조준·채굴·설치 판정은 원본 권위 상태를 사용한다. 그림자 지면 질의도 실제 물리 handle을 사용하되 표시 위치에서 질의한다. SDK 표시 스키마에는 물리 객체나 비유한 수면 높이가 들어가지 않는다. 인벤토리 전체 대신 선택 슬롯과 장비만 표시 모델로 옮긴다.

확정 이벤트의 타격점·숫자·죽음 잔상은 기존 고정 앵커를 유지한다. 현재 없는 투사체 경로 trail 기능이나 LocalInputPreview를 새로 만들지 않았다. 한 틱 안에서 생겼다가 사라져 완료된 틱에 존재하지 않는 객체의 중간 수명을 새로 재현하지 않는다. 입력 지연 감소 또는 성능 향상은 주장하지 않는다.

30 TPS, 게임 규칙, snapshotVersion 0.26.0과 저장 키는 그대로다. 0.25.0 이하 저장은 기존 정책대로 새 월드가 필요하다. 온라인 상대도 동일 게임 버전이어야 한다.

## 검증

[측정 결과](verification-presentation-0.28.1.json). 실제 Edge와 고정 공개 SDK를 사용했다. 단독 E2E는 UI로 새 게임·이동·채굴·회수·설치·저장/복원·동굴 탐험·모바일 화면을 확인하며 detached 표시 모델과 이동 보간도 관측한다.

같은 PC의 두 독립 브라우저 문맥이 공개 relay와 실제 RTC로 접속하여 이동·회전·공격·정상 퇴장을 수행했다. 1.5m 순간이동은 UI 기능 검증이 아니라 두 권위 시뮬레이션의 동일 미래 틱에 주입한 테스트 fixture다. 표시 snap, HUD 앵커, 이후 동일 틱 상태 해시, 지형 Worker 및 WebGL 상태를 확인했다. capture 계측은 스키마 전달 준비와 SDK capture를 포함하며 600개 한정 창이다. 짧은 실행의 수치이며 기기 성능 기준이나 전후 개선율이 아니다.

외부 NAT, 모바일 실기기, 모든 적/무기 조합, 강제 rollback 복구, 장기 부하 및 같은 틱 내 초단명 투사체는 미검증이다. Pages의 최종 main/HTML SHA와 공개 E2E는 PR 배포 결과에 기록한다.

최종 고정 SDK에는 [PR #47](https://github.com/byh-playground/bloom-gamekit/pull/47)의 선택적 중첩 상태 전환 원자성과 [PR #48](https://github.com/byh-playground/bloom-gamekit/pull/48)의 preview 종료 후 authority 구간 보존 수정이 포함된다. 공식 source의 표시 프레임 브라우저 회귀를 실제 CDN dist로 실행했고, 게임 핵심 E2E와 두 피어 RTC도 최종 pin으로 통과했다.
