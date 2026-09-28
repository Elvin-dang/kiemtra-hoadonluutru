"use client";

import { useEffect, useState } from "react";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { usePlatform } from "./platform";

const DEFAULT_MODEL_HINT = "Mặc định: gpt-6-luna";
const TEST_TEXT = "Thuê phòng nghỉ từ ngày 01/05/2025 đến ngày 02/05/2025";
const TEST_LIMITS = { maxTexts: 1, maxTextLength: 200, concurrency: 1 };
// Answered, even without a date, means the key and model work.
const WORKING_NOTE = "AI không xác định được";

type TestResult = { isOk: boolean; text: string };

// Desktop only: the user's own OpenAI key (kept by the OS credential store) and model.
export function AiKeyFields() {
  const { aiKey, aiModel, askAi } = usePlatform();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [model, setModel] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    void aiKey?.status().then((status) => {
      if (isActive) setKeyStatus(status);
    });
    void aiModel?.get().then((current) => {
      if (isActive) setModel(current);
    });
    return () => {
      isActive = false;
    };
  }, [aiKey, aiModel]);

  if (!aiKey && !aiModel) return null;

  const handleSaveKey = async () => {
    if (!aiKey || !draftKey.trim()) return;
    try {
      setKeyStatus(await aiKey.save(draftKey.trim()));
      setDraftKey("");
      setMessage(null);
    } catch (error) {
      setMessage(`Không lưu được khóa: ${String(error)}`);
    }
  };

  const handleRemoveKey = async () => {
    if (!aiKey) return;
    await aiKey.remove();
    setKeyStatus(null);
  };

  const handleSaveModel = async () => {
    if (aiModel && model.trim()) await aiModel.set(model.trim());
  };

  // One real request with the saved key and model, so problems show here instead of in the results.
  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    await handleSaveModel();
    try {
      const answer = await askAi([TEST_TEXT], TEST_LIMITS);
      const item = answer.status === "ok" ? answer.results[0] : undefined;
      if (answer.status === "disabled") setTestResult({ isOk: false, text: "Chưa có khóa hoặc model." });
      else if (!item) setTestResult({ isOk: false, text: "Không gọi được AI." });
      else if (item.date !== null || item.note === WORKING_NOTE)
        setTestResult({ isOk: true, text: `Khóa và model "${model.trim()}" hoạt động.` });
      else setTestResult({ isOk: false, text: item.note });
    } catch (error) {
      setTestResult({ isOk: false, text: `Không gọi được AI: ${String(error)}` });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="mt-4 grid items-start gap-4 sm:grid-cols-2">
      {aiKey && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Khóa OpenAI API</span>
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              aria-label="Khóa OpenAI API"
              placeholder="sk-…"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
            />
            <Button disabled={!draftKey.trim()} onClick={() => void handleSaveKey()}>
              Lưu khóa
            </Button>
            {keyStatus && (
              <Button variant="outline" onClick={() => void handleRemoveKey()}>
                Xóa khóa
              </Button>
            )}
          </div>
          {keyStatus ? (
            <span className="text-green-700">Đã lưu (••••{keyStatus})</span>
          ) : (
            <span className="text-muted-foreground">Chưa có khóa — AI sẽ không được dùng.</span>
          )}
          <span className="text-muted-foreground">Khóa được lưu an toàn trong Windows (Credential Manager).</span>
          {keyStatus && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={isTesting} onClick={() => void handleTest()}>
                {isTesting ? "Đang kiểm tra…" : "Kiểm tra khóa"}
              </Button>
              {testResult && (
                <span className={testResult.isOk ? "text-green-700" : "text-red-600"}>{testResult.text}</span>
              )}
            </div>
          )}
          {message && <span className="text-red-600">{message}</span>}
        </div>
      )}
      {aiModel && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Model</span>
          <Input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            onBlur={() => void handleSaveModel()}
          />
          <span className="text-muted-foreground">{DEFAULT_MODEL_HINT}</span>
        </label>
      )}
    </div>
  );
}
