import { useEffect, useMemo, useState } from 'react';

const MODEL_OPTIONS = [
  { label: 'Gemma 4 26B', value: 'gemma-4-26b-a4b-it' },
  { label: 'Gemma 4 31B', value: 'gemma-4-31b-it' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
];

const STORAGE_KEY = 'codex-demo-model';
const DEFAULT_MODEL = MODEL_OPTIONS[0].value;
const LOADING_TIPS = [
  '모델이 답을 정리하는 중',
  '문맥을 이어 붙이는 중',
  '이미지와 질문을 함께 해석하는 중',
  '문장을 조금씩 생성하는 중',
];

function parseSseChunk(buffer) {
  const events = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() || '';

  for (const block of blocks) {
    const lines = block.split('\n');
    let eventType = 'message';
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      }
      if (line.startsWith('data:')) {
        dataLine += line.slice(5).trim();
      }
    }

    if (dataLine) {
      events.push({
        event: eventType,
        data: JSON.parse(dataLine),
      });
    }
  }

  return { events, rest };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataUrl: String(reader.result),
      });
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '안녕하세요. 질문을 입력하거나 이미지를 올려보세요.',
      images: [],
    },
  ]);
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const [streamFrame, setStreamFrame] = useState(0);
  const [selectedModel, setSelectedModel] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return MODEL_OPTIONS.some((model) => model.value === stored) ? stored : DEFAULT_MODEL;
  });

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error('health check failed');
        }
        setApiStatus('ok');
      } catch (healthError) {
        setApiStatus('error');
      }
    };

    checkHealth();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (!sending) {
      setStreamFrame(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setStreamFrame((current) => current + 1);
    }, 700);

    return () => window.clearInterval(timer);
  }, [sending]);

  const currentModelLabel = useMemo(() => {
    return MODEL_OPTIONS.find((model) => model.value === selectedModel)?.label || selectedModel;
  }, [selectedModel]);

  const onPickFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const nextAttachments = await Promise.all(files.map(readFileAsDataUrl));
    setAttachments((current) => [...current, ...nextAttachments]);
    event.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!prompt.trim() && attachments.length === 0) {
      return;
    }

    const userMessage = {
      role: 'user',
      content: prompt.trim(),
      images: attachments,
    };
    const nextMessages = [...messages, userMessage];
    const assistantIndex = nextMessages.length;

    setMessages((current) => [
      ...current,
      userMessage,
      {
        role: 'assistant',
        content: '',
        images: [],
        streaming: true,
      },
    ]);
    setPrompt('');
    setAttachments([]);
    setError('');
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || 'Failed to contact backend');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('Streaming response is not available');
      }

      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        buffer += decoder.decode(result.value || new Uint8Array(), { stream: !done });

        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;

        for (const item of parsed.events) {
          if (item.event === 'delta') {
            setMessages((current) => {
              const next = [...current];
              const target = next[assistantIndex];
              if (target) {
                next[assistantIndex] = {
                  ...target,
                  content: `${target.content || ''}${item.data.text}`,
                };
              }
              return next;
            });
          }

          if (item.event === 'meta') {
            setApiStatus('ok');
          }

          if (item.event === 'done') {
            setApiStatus('ok');
            setMessages((current) => {
              const next = [...current];
              if (next[assistantIndex]) {
                next[assistantIndex] = {
                  role: 'assistant',
                  content: item.data.reply,
                  images: [],
                  streaming: false,
                };
              }
              return next;
            });
          }

          if (item.event === 'error') {
            throw new Error(item.data.error || 'Gemini request failed');
          }
        }
      }
    } catch (requestError) {
      setApiStatus('error');
      setError(requestError.message || 'Unexpected error');
      setMessages((current) => {
        const next = [...current];
        if (next[assistantIndex]) {
          next[assistantIndex] = {
            role: 'assistant',
            content: '요청 처리에 실패했습니다.',
            images: [],
            streaming: false,
          };
        }
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Gemini API</p>
          <h1>AI Chat Studio</h1>
          <p className="subcopy">
            텍스트로 대화하고, 이미지 파일을 업로드하면 그대로 모델 입력으로 전달합니다.
          </p>
        </div>
        <div className="hero-actions">
          <div
            className={
              apiStatus === 'ok'
                ? 'status-pill status-ok'
                : apiStatus === 'error'
                  ? 'status-pill status-error'
                  : 'status-pill'
            }
          >
            {apiStatus === 'ok' ? '🟢 API OK' : apiStatus === 'error' ? '🔴 API ERROR' : '🟡 CHECKING'}
          </div>
          <button type="button" className="settings-button" onClick={() => setSettingsOpen((value) => !value)}>
            Settings
          </button>
          <div className="status-pill">{sending ? 'Thinking...' : currentModelLabel}</div>
        </div>
      </section>

      {settingsOpen ? (
        <section className="settings-panel">
          <div className="settings-header">
            <strong>Model</strong>
            <span>현재 선택: {currentModelLabel}</span>
          </div>
          <div className="model-grid">
            {MODEL_OPTIONS.map((model) => (
              <button
                key={model.value}
                type="button"
                className={model.value === selectedModel ? 'model-chip active' : 'model-chip'}
                onClick={() => setSelectedModel(model.value)}
              >
                <span>{model.label}</span>
                <code>{model.value}</code>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="chat-panel">
        <div className="chat-history">
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
              <div className="bubble-meta">{message.role === 'user' ? 'You' : 'Assistant'}</div>
              <div className="bubble-text">{message.content}</div>
              {message.streaming ? (
                <div className="streaming-stage">
                  <div className="streaming-lines">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="streaming-status">
                    <strong>{LOADING_TIPS[streamFrame % LOADING_TIPS.length]}</strong>
                    <span>
                      {Array.from({ length: (streamFrame % 4) + 1 }, () => '·').join('')}
                    </span>
                  </div>
                </div>
              ) : null}
              {message.images.length > 0 ? (
                <div className="attachment-grid">
                  {message.images.map((image, imageIndex) => (
                    <figure className="attachment" key={`${image.name}-${imageIndex}`}>
                      <img src={image.dataUrl} alt={image.name || `attachment-${imageIndex + 1}`} />
                      <figcaption>{image.name || `image-${imageIndex + 1}`}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <label className="prompt-label" htmlFor="prompt">
            질문
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="무엇이든 물어보세요."
            rows={4}
          />

          <div className="composer-row">
            <label className="upload-button">
              이미지 추가
              <input type="file" accept="image/*" multiple onChange={onPickFiles} />
            </label>

            <button type="submit" disabled={sending}>
              {sending ? '전송 중...' : '전송'}
            </button>
          </div>

          {attachments.length > 0 ? (
            <div className="pending-attachments">
              {attachments.map((image, index) => (
                <div className="pending-card" key={`${image.name}-${index}`}>
                  <img src={image.dataUrl} alt={image.name} />
                  <div className="pending-card-body">
                    <span>{image.name}</span>
                    <button type="button" onClick={() => removeAttachment(index)}>
                      제거
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {error ? <div className="error-banner">{error}</div> : null}
        </form>
      </section>
    </main>
  );
}
