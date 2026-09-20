# ghDeployTest

외부 라이브러리를 쓰지 않는 아주 작은 웹 서버입니다.

## 화면에서 볼 수 있는 것

- 앱 버전(`APP_VERSION`), 컨테이너 이름, 시작 시각, 가동 시간, 방문 수
- `.env` 의 `APP_MESSAGE` 로 바꾸는 제목
- 버튼을 누르면 `/api/ping` 응답 시각 표시

## 주소

| 경로 | 용도 |
| --- | --- |
| `/` | 확인용 화면 |
| `/health` | 상태 확인 |
| `/api/ping` | 서버 시각과 버전을 JSON 으로 반환 |

## 로컬에서 실행

```bash
npm test     # 테스트
npm start    # http://localhost:3000
```
