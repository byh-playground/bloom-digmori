# 초기 이관 상태 — 2026-10-12

상태: BLOCKED / Candidate. 게임 파일·모듈 소스·실제 SDK는 아직 이 저장소에 없다.

Library에서 확인한 파일:
- bloom_sandbox_0.25.0_caves_dungeons_rpg.html — libfile_6bbf3f83025c8191b51cbcd53b9458c0 — 419318 bytes.
- bloom_sandbox_0.25.0_source_tests.zip — libfile_389c35b84ef481918d0a49884c3029ad — 1080724 bytes.
- bloom_sandbox_0.25.0_verification.md — libfile_a126e146e2b0819187285ccfd63d7209 — 3640 bytes.

현재 skill에서 official library_download.py와 library_file_transfer.py, library_hosted_apps.py를 새 작업 디렉터리에 확보했다. 전체 구조화 검색 응답을 변경 없이 입력하고 문서/ZIP/HTML 인덱스만 선택했다. Windows Python 3.13.7에서 다운로드 실행은 다음 오류로 중단됐다:

`library download request failed: Library prepare_materialize is not available`

HTML/ZIP 생성·읽기 확인은 실패했다. helper 패치, 임의 URL 재구성, raw URL 다운로드, Library read를 이용한 원본 코드 재구성을 하지 않았다. 초기 자동 다운로드 경로에서는 xattr 단계에 도달하지 않았다. 검증 문서는 Library read로 내용만 확인했다.

공통 규칙 기준: bloom-reference 76625d708de290134973758d5a62b3900bc291ba.
bloom-bounko는 public, license=null, Pages build_type=workflow. 관련 checkout에서 AGENTS.md/.agents/skills/SKILL.md를 찾지 못했다.

## 이어서 할 일

1. 현재 소비 실행기에서 지원되는 Library materialize 연결을 복구하거나 원본 파일을 정식 로컬 첨부로 제공받는다. 다른 환경의 workspace_path를 PC 경로로 취급하지 않는다.
2. ZIP의 원래 src/ 계층과 build.py를 확인하고 소스 SSOT를 이관한다. README의 빌드 연결은 현재 준비안이며 실제 출력 경로에 맞춰 확인한다.
3. 단일 HTML 재생성 결과를 원본과 비교한 뒤 Digmori 이름·문서·메타데이터만 정리한다. 저장 키·포맷은 불필요하게 변경하지 않는다.
4. 원본 GameKit import와 dist SHA의 실제 API를 확인하고 최소 로딩/통합 오류만 수정한다.
5. 실제 Edge/Chromium에서 정적 경로의 부팅→새 게임→이동→채굴/설치→저장/복원 흐름을 180초 상한 내 검증한다.
6. 문서 조작표·권리 고지·검증 결과를 확정하고 Draft PR 빌드/검토를 통과시킨 후 머지한다.
7. Pages workflow 설정을 활성화하고 공개 build.json commit 및 HTML SHA-256을 main과 비교한다.

외부 NAT 멀티플레이와 실기기 검증은 별도 범위다. 원본의 GameKit 시험용 API 주입 결과는 실제 SDK 통합 검증이 아니다.


## 공식 resolved-reference 경로 추가 확인

부모가 확정 reference에 대한 공식 직접 전송 경로를 명시해 재개했다. PC 절대 목적지를 지정한 library_prepare_materialize는 정상 signed transfer를 반환했고 workspace_path는 null이었다. 완전한 transfer 객체를 변경 없이 현재 library_file_transfer.py의 materialize 인자와 stdin으로 전달했다. Python 3.13.7/Windows에서 메타데이터 기록 시 AttributeError: module 'os' has no attribute 'setxattr'로 종료됐다. 인증 거절이 아니라 공식 helper의 Windows xattr 미지원 오류다. 최종 목적지 HTML 파일은 존재하지 않는다. helper 수정, 메타데이터 생략, 임시 파일 회수, raw URL 다운로드는 하지 않았다.
