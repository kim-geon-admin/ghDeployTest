# ghDeployTest

Synology NAS 자동 배포를 시험하기 위한 아주 작은 웹 서버입니다. 외부 라이브러리를 쓰지 않습니다.

## 화면에서 볼 수 있는 것

- 배포된 커밋 버전(`APP_VERSION`), 컨테이너 이름, 시작 시각, 가동 시간, 방문 수
- `.env` 의 `APP_MESSAGE` 로 바꾸는 제목 (설정 변경 후 재배포 확인용)
- 버튼을 누르면 `/api/ping` 응답 시각 표시

## 주소

| 경로 | 용도 |
| --- | --- |
| `/` | 확인용 화면 |
| `/health` | 배포 후 상태 확인 (compose healthcheck 가 사용) |
| `/api/ping` | 서버 시각과 버전을 JSON 으로 반환 |

## 로컬에서 실행

```bash
npm test     # 배포 전 검사와 같은 테스트
npm start    # http://localhost:3000
```

## 배포

`main` 에 push 하면 GitHub Actions 가 테스트 → 이미지 빌드(GHCR) → NAS 배포를 진행합니다.
설정은 `infra/synology/` 에 있으며 `nas-deploy` CLI 로 만들었습니다.
