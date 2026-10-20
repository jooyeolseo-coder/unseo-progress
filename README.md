# 운서동 공정 도면 (웹앱)

운서동 숙박시설 도장공사 공정 체크용 웹앱입니다. claude.ai 아티팩트판을 외부 링크용으로 옮긴 것입니다.

- 화면: GitHub Pages (이 저장소)
- 데이터·로그인: Google Firebase (Firestore + 구글 로그인)
- 도면 이미지·공정 데이터는 이 저장소에 없습니다. 로그인한 등록 사용자만 Firestore에서 불러옵니다.

## 파일
| 파일 | 역할 |
|---|---|
| index.html | 앱 화면과 기능 |
| boot.js | Firebase 연결, 로그인, 권한 확인, 최초 데이터 가져오기 |
| firebase-config.js | Firebase 웹 앱 설정값 |
| firestore.rules | Firestore 보안 규칙 (콘솔 규칙 탭에 붙여넣음) |
| manifest.webmanifest, sw.js, icon-*.png | 홈 화면 설치(전체 화면 앱) |

## 사용자 추가
Firebase 콘솔 → Firestore → `access` 컬렉션 → 문서 추가.
- 문서 ID: 구글 계정 이메일(소문자)
- 필드: `admin` (boolean) — 관리자만 true

## 태블릿 설치
- iPad(Safari): 공유 버튼 → 홈 화면에 추가
- 안드로이드(Chrome): 메뉴 → 홈 화면에 추가(앱 설치)

홈 화면 아이콘으로 열면 주소창 없이 전체 화면으로 열립니다.
