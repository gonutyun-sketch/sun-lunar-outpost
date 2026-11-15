# SUN: Lunar Outpost 최종 검수

2026-11-15, 서울 현지 시간 기준. 기준 코드는 GitHub main의 [70d287a](https://github.com/gonutyun-sketch/sun-lunar-outpost/commit/70d287a5e3b980ad4b8d8307947ebb4ac17bf9ed)입니다. 작업 브랜치는 `fix/final-mobile-qa-release`입니다.

## 출시 판정

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 수정판 빌드와 PC 브라우저 게임플레이 | PASS | 자동 테스트 149개, 브라우저 완주와 미션 시나리오 |
| 스마트폰의 실제 스피커와 화면 잠금 복귀 | NOT TESTED | iPhone·iPad·Android 실기기 미확보 |
| 로컬 데모 영상 | PASS | 29.20초, 영어 오버레이, 1920×1080, 전체 디코딩 |
| 로그인 없이 열리는 데모 주소 | BLOCKED | 팀 Project 탭에서 공개 데모 URL을 확인할 수 없음 |
| 글로벌 수상 데이터 요건 | 미확인 | 현재 LRO/LOLA 제품은 공식 챌린지 Resources 목록에 없음 |
| 수정판 GitHub Pages | NOT DEPLOYED | 공개 게임의 번들은 기준 main과 일치. 수정판은 로컬에서 검증 |

**제출 패키지 판정 — BLOCKED.** 공개 게임 주소는 열리며 로컬 데모 파일도 준비되어 있습니다. 제출 양식에서 요구하는 공개 데모 주소가 필요합니다. 글로벌 수상 자격은 아래 데이터 조건을 확인해야 합니다. Team SUN의 Local Event는 서울이며, 공식 가이드의 제출 마감은 **2026년 11월 15일 23:59 KST**입니다. [공식 제출 가이드](https://www.spaceappschallenge.org/resources/project-submission-guide/) · [Team SUN](https://www.spaceappschallenge.org/2026/find-a-team/sun/)

## 1. 오디오 및 화면 수정

| 등급 | 재현 및 원인 | 수정 |
| --- | --- | --- |
| P1 | 기지 지속음 오실레이터가 최종 음량을 직접 흔들었습니다. 음악과 효과음의 분리 버스가 출력에서 합산되며 피크 한계를 넘겼습니다. | 기지 내부 변조와 출력 음량을 분리했습니다. 음악과 효과음에 각각의 음량을 유지하고 합산 뒤 피크에만 부드러운 제한을 적용했습니다. |
| P1 | 타이머 지연 시 과거 시작 시각을 가진 노트가 겹칠 수 있었습니다. 로버 엔진 음정도 거의 동일한 목표값을 프레임마다 예약했습니다. | 늦은 노트가 겹쳐 시작하지 않도록 최소 예약 여유를 적용했습니다. 음정 변화의 크기와 재예약 빈도를 제한했습니다. 음악과 지속음의 예약·노드를 음소거 또는 종료 시 해제합니다. |
| P1 | 844×390 메뉴에서 소리 설정창 하단이 화면 밖으로 내려갔고, 휴대폰 세로 모드에서는 기지 설정창의 왼쪽이 잘렸습니다. | 메뉴 설정창 자체를 스크롤할 수 있게 하고, 좁거나 낮은 화면의 기지 설정창이 뷰포트 안에 배치되도록 수정했습니다. |
| P2 | 효과음 0%에서 음악이 재생될 때 스피커 아이콘이 꺼진 상태로 보였습니다. | 효과음이 0%여도 음악이 켜져 있으면 음악 음량을 표시합니다. |

Windows Edge의 실제 `OfflineAudioContext`에서 수정 전후를 측정했습니다. 피크는 1.0이 디지털 풀스케일입니다. 실기기에서 들린 소리의 원인에는 오디오 하드웨어와 운영체제도 관여할 수 있습니다.

| 조건 | 44.1 kHz 수정 전 → 수정 후 | 48 kHz 수정 전 → 수정 후 |
| --- | --- | --- |
| 음악 100% 단독 | 피크 0.410 → 0.414, 클리핑 0 → 0 | 피크 0.430 → 0.406, 클리핑 0 → 0 |
| 효과음 100% 단독 | 피크 1.002 → 0.666, 클리핑 2 → 0 | 피크 1.481 → 0.960, 클리핑 2 → 0 |
| 음악·효과음 100% 동시 | 피크 1.145 → 0.748, 클리핑 89 → 0 | 피크 2.214 → 0.924, 클리핑 102 → 0 |
| 동시 100%, 예약 타이머 21초 지연 | 피크 1.574 → 0.839, 클리핑 300 → 0, 늦은 음 26 → 0 | 피크 2.665 → 0.931, 클리핑 335 → 0, 늦은 음 30 → 0 |

수정판에서 음량 20·50·100%, 음악과 효과음의 단독·동시 재생, 44.1·48 kHz를 조합한 18회와 타이머 지연 2회 모두 클리핑·비정상 수치·만료 노트 재생이 0건이었습니다. 기지 지속음, 로버 모터, 그림자 경고, 빠른 퍼즐 조작, 드릴과 도킹에 쓰는 실제 오디오 레시피를 합성했습니다. 출력의 최대 피크는 0.95995였습니다. 반복 예약되는 로버 모터 음정 이벤트는 대표 구간에서 1,220개에서 3개로 줄었습니다.

Windows Edge 모바일 화면에서 CPU를 4배 느리게 설정하고 100% 음량으로 기지를 5분 이상 실행했습니다. AudioContext는 1개였고, 시점별 활성·예약 소스는 20~32개, 실행 중 최대 40개였습니다. 워밍업 이후 샘플 시점의 JS 힙은 약 6.0~6.3 MB였습니다. 음소거 뒤 활성·예약 소스가 0개가 됐으며, 다시 켰을 때 기존 컨텍스트가 재사용됐습니다. 이 계측은 JS 힙과 그래프의 소스 개수를 대상으로 합니다. 실기기 스피커, 버퍼 언더런, 운영체제 화면 잠금은 검증 범위 밖입니다.

## 2. 게임플레이 및 호환성

| 테스트 | 환경 | 결과 | 증거 및 범위 |
| --- | --- | --- | --- |
| 자동 설치·타입·테스트·빌드 | Windows, Node 26, npm 11 | PASS | `npm ci --offline`, `npm run typecheck`, `npm test` 149/149 (기준 143개), `npm run build`. 설치는 준비된 npm 캐시 사용 |
| PC 메뉴, 오디오 설정, 도움말, 이어하기 | Windows Edge, Playwright Chromium | PASS | 첫 실제 입력에서 컨텍스트 1개, 음소거·음량 저장, 한/영 전환, 가시성 이벤트 주입 후 오디오 일시 중지·복귀. 프로덕션에 개발 훅 없음 |
| 기지 운영 12교대 | Edge, 개발 QA 빌드 | PASS | 쉬움·보통·어려움 3회 모두 12교대 성공. 시설 조정, 업그레이드, 비상 선택, 연구와 결과 화면을 UI에서 조작 |
| 튜토리얼 | Edge, 키보드·터치 에뮬레이션 | PASS | 첫 교대, 단계 유지·이어하기, 배치·강조, 건너뛰기, 격리 연습, M1 실제 키보드 왕복 |
| 로버 M1 성공·실패·중단 | Edge, 키보드·터치 에뮬레이션 | PASS | 햇빛 경로 왕복, 회로 조작과 도킹. 배터리 소진·재시도·중도 종료는 위치·배터리 테스트 훅을 사용 |
| 로버 M2 성공·실패·중단 | Edge, 키보드·터치 에뮬레이션 | PASS | 물품 수집, 압력 조작, 도킹 및 기지 반영. 이동을 단축하는 위치 훅을 사용하고 퍼즐은 실제 버튼으로 조작 |
| 로버 M3 성공·실패·중단 | Edge, 키보드·터치 에뮬레이션 | PASS | 시추 홀드, 실제 샘플 진척, 도킹. 터치 홀드 별도 검사. 이동·소진 상태 일부는 테스트 훅을 사용 |
| 로버 아트·그림자 회귀 | Windows Edge, 1366×768·320×568 | PASS | 8방향 렌더링과 이동을 확인. 햇빛·그림자·깊은 그림자에서 캔버스 크기 유지, 경고 불투명도 고정, 배터리 위험 애니메이션 없음 |
| 한/영 정보 화면, 튜토리얼 강조 | Edge, 6개 크기 × 2언어 | PASS | 플레이 방법·과학·제작진 탭과 조작 영역, 회로 타일 활성화 및 강조 정렬 확인 |
| 저장·이어하기, 음량 설정 | Edge·Chromium·WebKit | PASS | 새로고침 뒤 동일 튜토리얼 단계와 음량 설정 복원. v1 마이그레이션·v2 저장은 Vitest |
| PC 오프라인 HTML | Edge | PASS | 파일을 직접 열어 플레이 방법 배경, 튜토리얼과 이어하기 확인. 외부 요청 0 |
| 오디오 없는 환경 | Windows Playwright WebKit | PASS | AudioContext 생성 API가 없는 상태에서 터치 UI, 설정, 저장, 언어와 튜토리얼 정상. 실제 소리 출력은 NOT TESTED |
| Firefox | Windows Playwright Firefox | NOT TESTED | 환경에서 탭 하위 프로세스 시작이 실패하여 게임을 로드하기 전에 중단 |
| Android Chrome / Samsung Internet | Android 실기기 | NOT TESTED | Windows Chromium 및 터치 에뮬레이션에서 입력을 별도로 검사 |
| iOS Safari / iOS Chrome / iPadOS | iPhone·iPad 실기기 | NOT TESTED | Windows WebKit에서 렌더링·설정 UI만 검사 |
| macOS Safari / Chrome | macOS 실기기 | NOT TESTED | 해당 기기 없음 |
| 공개 버전 | GitHub Pages, 비로그인 브라우저 | PASS / NOT DEPLOYED | 기준 `70d287a`가 사용하는 JS·CSS 해시와 일치. 수정판은 아직 공개되지 않음 |

Windows Edge에서 검증한 화면은 320×568, 360×800, 375×667, 390×844, 412×915, 844×390, 768×1024, 1024×768, 1366×768, 1920×1080입니다. 1024px 이하에서 터치 입력을 에뮬레이션했습니다. 390×844와 844×390 사이 회전 시 조이스틱, HUD 및 튜토리얼 강조가 다시 배치됐습니다. 최종 프로덕션 메뉴·기지 화면의 행렬에서는 미처리 JS 예외와 로컬 자산 실패가 0건이었습니다. 테스트 실행 중 외부 글꼴 요청은 의도적으로 차단했습니다.

실제 스마트폰 확인은 최신 빌드에서 음량 20·50·100%로 메뉴와 기지를 열고, 로버 주행·그림자 경고·퍼즐·드릴을 들어보는 순서입니다. 앱을 바꿨다가 돌아온 뒤 화면 잠금과 복귀를 확인합니다. 스피커, 이어폰, 절전 모드를 구분해 측정하면 환경별 차이를 기록할 수 있습니다.

## 3. NASA 자료 및 데모

- NASA GSFC LRO/LOLA Lunar Polar Illumination, PDS 제품 `AVGVISIB_85S_060M_201608` 한 개를 사용합니다. SUN-01 (89.4749°S, 137.4431°W)의 60m 픽셀은 태양 원반 일부가 보이는 시간 비율 88.44%입니다. 300m×300m 주변 평균 55.36%와 섀클턴 크레이터 바닥 0%는 같은 제품의 비교값입니다. 약 18.6년 모형 자료입니다. [NASA 제품 페이지](https://pgda.gsfc.nasa.gov/products/69) · [게임 데이터](src/data/site.json) · [추출 코드](tools/extract-illumination.mjs)
- 패널 발전량은 게임 안에서 해당 장기 비율에 교대별 가상 계수와 가상 발전 단위를 적용해 계산합니다. 패널의 실제 효율, 특정 날짜의 일조 예보, 임무별 방사선·자원 값과 구별합니다. 이 릴리스의 코드 변경은 데이터, 기지·로버 규칙 및 저장 형식을 변경하지 않습니다.
- 공식 제출 가이드는 글로벌 수상 조건에 NASA 자료를 하나 이상 사용해야 한다고 안내합니다. Space Apps Connect의 운영진 답변은 해당 챌린지 Resources에 있는 자료를 하나 이상 사용해야 한다고 명시합니다. Junior Astronaut Mission Trainer의 Resources 탭에서 NASA Open APIs, DONKI, OSDR, RadLab, Mars Trek을 확인했습니다. 현재의 LRO/LOLA 일조량 제품은 그 목록에서 찾을 수 없었습니다. 이 프로젝트의 현재 구현에서 위 다섯 자료 사용을 확인하지 못했습니다. 제출 설명에는 실제로 사용한 LRO/LOLA를 기재하고, 글로벌 수상 자격은 운영 측에 확인해야 합니다. [공식 제출 가이드](https://www.spaceappschallenge.org/resources/project-submission-guide/) · [챌린지 Resources](https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/?tab=resources) · [운영진 답변](https://github.com/nasa/spaceapps/discussions/1849)
- `SUN_Lunar_Outpost_NASA_Demo.mp4`의 원본을 끝까지 디코딩했습니다. 29.20초, 1920×1080, 비디오 트랙 1개와 오디오 트랙 0개입니다. 달 기지 운영, 그림자 주행과 회로, 시추, NASA 데이터 및 결과 화면을 영어 오버레이와 함께 확인했습니다. 영상은 이전 빌드의 실제 플레이를 보여줍니다. `AI-GENERATED GAME ART` 표기가 있고 편집과 녹화는 스크립트로 제작됐습니다.
- 데모는 30초 이하 영상 또는 제목·소개를 포함한 최대 7장 슬라이드이며 로그인 없이 열려야 합니다. 이 영상 파일은 길이와 내용 조건을 충족하지만 공유 URL은 아직 확인되지 않았습니다. 업로드 후 시크릿 창에서 재생을 확인하고 `Link to Project Demo`에 넣습니다. [데모 규격 및 업로드 안내](https://www.spaceappschallenge.org/resources/project-submission-guide/) · [AI 표기 운영진 안내](https://github.com/nasa/spaceapps/discussions/1947)
- 게시된 코드와 자산 출처를 References에 넣습니다. 참가 약관에는 별도 OSI 호환 라이선스를 지정하지 않은 제출 원본을 NASA가 Apache 2.0으로 배포한다고 안내돼 있습니다. 현재 저장소에는 별도 LICENSE가 확인되지 않았습니다. [참가 약관](https://www.spaceappschallenge.org/legal/) · [AI 및 서드파티 사용 내역](AI_USAGE.md)

## 4. English submission copy

### Project title

SUN: Lunar Outpost

### High-Level Project Summary

SUN: Lunar Outpost is a Korean–English browser game that helps elementary and middle school students learn the trade-offs of running a lunar research base. Players manage power, oxygen, food, crew health, and research over 12 shifts. They also drive a rover to make repairs and collect samples. NASA Lunar Reconnaissance Orbiter data grounds the base’s solar power model in the real terrain of the Moon’s south pole.

### Detailed Project Description

A lunar outpost relies on systems that compete for the same limited power. Students can switch on the greenhouse or the oxygen recycler, review the projected resource changes, and see what happens when the shift advances. Equipment failures and radiation alerts ask them to weigh safety, supplies, and research. Three rover missions let players reconnect a solar circuit, stabilize pressure in an oxygen facility, and drill for science samples. Driving through shadow increases battery drain and makes route planning part of the mission.

The site is a real ridge near Shackleton crater. Using the LRO/LOLA Average Solar Illumination product, our game reads a sunlit fraction of 88.44% for one 60 m pixel and compares it with the surrounding area (55.36%) and the crater floor (0%). The fraction represents modeled time when some part of the Sun is visible over an approximately 18.6-year period. Its value sets the baseline of the solar simulation. Shift conditions, resource units, and rover energy rates are fictional training values.

The game uses React, TypeScript, Vite, Canvas 2D, Web Audio, and local browser saves. A pixel-art instructor guides learners through actual controls, and three difficulty levels let students choose how much help they want. We exercised the 12-shift scenarios and rover puzzles with browser automation, measured the audio signal, and checked keyboard and emulated touch controls. A future classroom study could measure how much students learn and test more physical mobile devices.

### NASA Data and Resources

NASA Goddard Space Flight Center, LRO Lunar Orbiter Laser Altimeter (LOLA), Lunar Polar Illumination. Average Solar Illumination PDS product `AVGVISIB_85S_060M_201608`, 60 m per pixel. Used for the solar model and site comparisons. [NASA product](https://pgda.gsfc.nasa.gov/products/69) · [Mazarico et al., Icarus](https://doi.org/10.1016/j.icarus.2010.10.030)

### Synthetic Intelligence / AI Disclosure

Team SUN set the educational goal, designed the gameplay and rules, and directed playtesting and revisions. Anthropic Claude Code assisted with the game systems, tests, bilingual content, and original procedural Web Audio effects and music. OpenAI Codex assisted with the interface, original code-drawn pixel art, guided tutorial, browser QA, and release audio fixes. Codex automated capture of the running game and assisted with the demo’s English captions and scripted edit. The demo shows actual gameplay, including AI-assisted game art labeled on screen. The game runs without an external AI service.

### Links and References

- **Final Project** [Play SUN: Lunar Outpost](https://gonutyun-sketch.github.io/sun-lunar-outpost/). Select **English** in the main menu if needed.
- **Project Demo** Paste the signed-out, publicly playable URL of the 29.20-second video.
- **Source and AI details** [GitHub repository](https://github.com/gonutyun-sketch/sun-lunar-outpost) and [AI disclosure](https://github.com/gonutyun-sketch/sun-lunar-outpost/blob/main/AI_USAGE.md).
- **Software and fonts** [React](https://github.com/facebook/react) (MIT), [TypeScript](https://github.com/microsoft/TypeScript) (Apache-2.0), [Vite](https://github.com/vitejs/vite) (MIT), [Vitest](https://github.com/vitest-dev/vitest) (MIT), [Inter](https://fonts.google.com/specimen/Inter) and [Orbitron](https://fonts.google.com/specimen/Orbitron) (SIL Open Font License). The source repository includes the dependency lockfile.

## 5. GitHub 및 후속 확인

Pages 워크플로는 main 업데이트 시 설치·타입 검사·테스트·빌드 이후 배포합니다. PR 검토와 사용자의 병합 후 [Actions](https://github.com/gonutyun-sketch/sun-lunar-outpost/actions)에서 성공을 확인하고 공개 URL을 새로 연 뒤 소리 설정과 로버를 재검사합니다. 이번 검수에서는 사용자의 병합과 NASA 제출 버튼 조작을 수행하지 않았습니다.
