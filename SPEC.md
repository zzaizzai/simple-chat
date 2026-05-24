# System Specification

## 1. Overview

이 시스템은 웹 기반 AI 채팅 애플리케이션이다.

- 백엔드: Python + FastAPI
- 프론트엔드: React
- AI 연동: Gemini API
- 데이터 저장: 기본적으로 메모리 저장

목표는 사용자가 텍스트로 질문하고, 이미지 파일을 업로드해서, 해당 입력을 모델에 그대로 전달하고 응답을 받는 것이다.

## 1.1 API Status

- 상태 표시 규칙: API가 정상 동작하면 `🟢`, 실패하면 `🔴`로 표시한다.
- 현재 상태: `🟢`
- 판정 기준:
  - `GET /api/health` 가 `200 OK` 를 반환해야 한다.
  - `POST /api/chat` 이 유효한 키와 모델로 응답해야 한다.
  - 이미지 업로드가 포함된 요청도 실패 없이 전달되어야 한다.

## 2. Core Requirements

### 2.1 Chat

- 사용자는 채팅 입력창에 질문을 입력할 수 있어야 한다.
- 사용자는 이전 대화 흐름을 유지한 상태로 질문을 계속 보낼 수 있어야 한다.
- 모델 응답은 화면의 대화 히스토리에 추가되어야 한다.

### 2.2 Image Upload

- 사용자는 이미지 파일을 하나 이상 업로드할 수 있어야 한다.
- 업로드된 이미지는 전송 시 모델 입력에 포함되어야 한다.
- 이미지 파일은 서버에서 재가공하지 않고, 가능한 한 원본 바이너리 의미를 유지한 채 LLM 입력으로 전달해야 한다.

### 2.3 Model Selection

- 사용자는 설정 버튼을 통해 모델을 선택할 수 있어야 한다.
- 선택한 모델은 다음 요청부터 반영되어야 한다.
- 기본 모델은 `gemma-4-26b-a4b-it`로 한다.

## 3. User Flow

1. 사용자가 웹 앱을 연다.
2. 기본 채팅 화면이 표시된다.
3. 사용자가 텍스트를 입력하거나 이미지를 첨부한다.
4. 사용자가 전송 버튼을 누른다.
5. 프론트엔드는 백엔드 `/api/chat`로 요청을 보낸다.
6. 백엔드는 Gemini API에 요청을 전달한다.
7. 응답이 돌아오면 프론트엔드는 assistant 메시지로 화면에 표시한다.

## 4. Frontend Specification

### 4.1 Pages

- 단일 채팅 페이지를 제공한다.
- 별도의 라우팅은 필수 요구사항이 아니다.

### 4.2 Components

- 채팅 히스토리 영역
- 메시지 입력 영역
- 이미지 업로드 영역
- 전송 버튼
- 설정 버튼
- 모델 선택 패널

### 4.3 State

프론트엔드는 다음 상태를 관리한다.

- messages: 대화 기록
- prompt: 현재 입력 텍스트
- attachments: 업로드된 이미지 목록
- sending: 요청 진행 상태
- error: 요청 실패 메시지
- selectedModel: 선택된 모델 ID

### 4.4 UX Rules

- 요청 중에는 전송 버튼을 비활성화한다.
- 업로드된 이미지는 미리보기를 보여준다.
- 모델 변경은 사용자가 명시적으로 선택했을 때만 반영한다.
- 설정은 localStorage에 유지할 수 있다.

## 5. Backend Specification

### 5.1 Runtime

- Python 3.9 기준으로 동작해야 한다.
- FastAPI를 사용한다.

### 5.2 Environment Variables

백엔드는 다음 환경변수를 읽는다.

- `AI-KEY`: Gemini API 키
- `GEMINI_API_KEY`: 대체 키
- `GOOGLE_API_KEY`: 대체 키

### 5.3 API Endpoints

#### `GET /api/health`

- 목적: 서버 상태 확인
- 응답: `{ "status": "ok" }`

#### `POST /api/chat`

- 목적: 텍스트와 이미지를 포함한 대화 요청 처리
- 입력:
  - `messages`: 대화 내역
  - `model`: 선택 모델 ID
- 출력:
  - `reply`: 모델 응답 텍스트
  - `model`: 실제 사용한 모델 ID

### 5.4 Message Format

각 메시지는 다음 구조를 가진다.

- `role`: `user` 또는 `assistant`
- `content`: 텍스트
- `images`: 이미지 배열

이미지 객체는 다음 필드를 가진다.

- `name`: 파일명
- `mimeType`: MIME 타입
- `dataUrl`: base64 data URL

### 5.5 Gemini Mapping

- user 메시지는 Gemini의 user content로 변환한다.
- assistant 메시지는 Gemini의 model content로 변환한다.
- 텍스트는 text part로 전달한다.
- 이미지는 inline data part로 전달한다.

## 6. Model Policy

### 6.1 Default Model

- 기본 모델은 `gemma-4-26b-a4b-it`이다.

### 6.2 Allowed Models

현재 UI에서 선택 가능한 모델은 다음과 같다.

- `gemma-4-26b-a4b-it`
- `gemma-4-31b-it`
- `gemini-2.5-flash`
- `gemini-2.5-pro`

### 6.3 Model Change Policy

- 모델 목록은 필요 시 확장 가능하다.
- 지원 여부가 확인되지 않은 모델은 UI에 넣지 않는다.
- 실제 API 호출 실패 시 백엔드는 오류를 프론트엔드에 전달한다.

## 7. Data Handling

- 기본 저장소는 메모리이다.
- 서버 재시작 시 대화 상태는 초기화될 수 있다.
- 영속 저장소는 필수 요구사항이 아니다.

## 8. Error Handling

- 백엔드 인증 실패는 401 또는 502 계열 오류로 표출한다.
- 모델 ID가 유효하지 않으면 백엔드는 오류 메시지를 반환한다.
- 네트워크 오류나 API 실패는 프론트엔드에서 읽기 쉬운 메시지로 표시한다.

## 9. Non-Functional Requirements

- 명시적 타입을 사용한다.
- 기본 변수에는 타입을 표시한다.
- 백엔드와 프론트엔드의 책임을 분리한다.
- 개발 환경에서 로컬 서버로 바로 실행 가능해야 한다.

## 10. Notes

- 이 문서는 구현 코드의 기준 문서이다.
- 새로운 기능을 추가할 때는 먼저 이 명세를 갱신한다.
- 실제 구현과 문서가 다르면, 구현 전에 문서를 우선 정리한다.
