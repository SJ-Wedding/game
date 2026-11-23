# 균열의 심판자 (Rift Judge)

PC/웹용 2D 액션 로그라이크 RPG MVP. 설치 없이 브라우저에서 바로 실행됩니다.

## 조작
WASD 이동 · 마우스 조준/클릭 공격 · T 자동공격 토글 · Space 대시 · Q/E 스킬 · F 패링

## 로컬 실행
`index.html`을 브라우저로 열면 됩니다. (빌드 불필요)

## GitHub Pages 배포
1. 이 폴더의 파일(`index.html`, `style.css`, `game.js`)을 저장소 루트에 업로드
2. 저장소 **Settings → Pages → Build and deployment**
3. Source: **Deploy from a branch**, Branch: **main** / **/ (root)** → Save
4. 1~2분 뒤 `https://<사용자명>.github.io/<저장소명>/` 에서 플레이

## 파일 구조
- `index.html` — 페이지 골격
- `style.css` — 스타일
- `game.js` — 게임 로직 (오브젝트 풀, 스킬트리, 유물 시너지, 보스 AI, 메타 진행)

메타 진행(영구 강화)은 브라우저 `localStorage`에 저장됩니다.
