# simple-chat

웹 기반 AI 채팅 애플리케이션입니다.

- 백엔드: Python + FastAPI
- 프론트엔드: React + Vite
- AI 연동: Gemini API
- 데이터 저장: 메모리 기반

## Environment

루트 `.env` 파일에 아래 키를 설정합니다.

```env
AI-KEY=your_gemini_api_key
```

## Backend Run

백엔드는 `backend/` 디렉터리에서 실행합니다.

```bash
cd backend
. ../.venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

백엔드 확인 주소:

- `http://127.0.0.1:8000/api/health`
- `http://127.0.0.1:8000/api/chat`

## Frontend Run

프론트엔드는 `frontend/` 디렉터리에서 실행합니다.

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

프론트엔드 접속 주소:

- `http://127.0.0.1:5173/`

## Notes

- 모델 선택은 화면의 `Settings` 버튼에서 가능합니다.
- 이미지는 업로드 시 그대로 모델 입력으로 전달됩니다.
- 서버 재시작 시 메모리 상태의 대화 내용은 초기화될 수 있습니다.
