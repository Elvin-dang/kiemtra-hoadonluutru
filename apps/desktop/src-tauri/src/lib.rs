use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;

mod update;

pub const PROMPT: &str =
    "Trích xuất ngày kết thúc dịch vụ/check-out từ thông tin lưu trú. Chỉ trả về DD/MM/YYYY hoặc KHONG_XAC_DINH.";
pub const MAX_OUTPUT_TOKENS: u32 = 1000;
// Ceilings — the same as the website's server defaults.
pub const MAX_TEXTS: usize = 100_000;
pub const MAX_TEXT_LENGTH: usize = 1000;
pub const MAX_CONCURRENCY: usize = 100;
pub const MAX_RETRIES: u32 = 3;

#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub max_texts: usize,
    pub max_text_length: usize,
    pub concurrency: usize,
}

impl Limits {
    pub fn effective(self) -> Limits {
        Limits {
            max_texts: self.max_texts.clamp(1, MAX_TEXTS),
            max_text_length: self.max_text_length.clamp(1, MAX_TEXT_LENGTH),
            concurrency: self.concurrency.clamp(1, MAX_CONCURRENCY),
        }
    }
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(untagged)]
pub enum AiItem {
    Answer { answer: String },
    Failed { date: Option<String>, note: String },
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum AiAnswer {
    Ok { results: Vec<AiItem> },
    Disabled,
    Failed,
}

pub struct StartupFile(pub Mutex<Option<String>>);

impl StartupFile {
    pub fn take(&self) -> Option<String> {
        self.0.lock().ok()?.take()
    }
}

pub fn request_body(model: &str, text: &str) -> Value {
    serde_json::json!({
        "model": model,
        "instructions": PROMPT,
        "input": text,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "store": false
    })
}

pub fn output_text(payload: &Value) -> String {
    payload["output"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|item| item["content"].as_array().into_iter().flatten())
        .filter(|part| part["type"] == "output_text")
        .filter_map(|part| part["text"].as_str())
        .collect()
}

pub fn note_for_status(status: u16) -> String {
    if status == 401 {
        "Khóa OpenAI không hợp lệ".to_string()
    } else {
        format!("AI HTTP {status}")
    }
}

pub fn is_retryable(status: u16) -> bool {
    status == 429 || status >= 500
}

/// Waits 1 s, 2 s, 4 s — or what the server's Retry-After asks for, capped at 30 s.
pub fn retry_delay(attempt: u32, retry_after: Option<&str>) -> Duration {
    retry_after
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|seconds| Duration::from_secs(seconds.min(30)))
        .unwrap_or_else(|| Duration::from_secs(1 << attempt))
}

pub fn next_free_path(dir: &Path, file_name: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(file_name);
    if !exists(&first) {
        return first;
    }
    let (stem, extension) = match file_name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
        None => (file_name.to_string(), String::new()),
    };
    (1..)
        .map(|n| dir.join(format!("{stem} ({n}){extension}")))
        .find(|candidate| !exists(candidate))
        .expect("an unbounded range always finds a free name")
}

pub fn startup_xlsx(args: &[String], exists: impl Fn(&Path) -> bool) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|arg| {
            let lower = arg.to_lowercase();
            (lower.ends_with(".xlsx") || lower.ends_with(".xlsm")) && exists(Path::new(arg.as_str()))
        })
        .cloned()
}

pub fn mask_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    chars[chars.len().saturating_sub(4)..].iter().collect()
}

const OPENAI_URL: &str = "https://api.openai.com/v1/responses";
const TIMEOUT: Duration = Duration::from_secs(15);
const KEY_SERVICE: &str = "kiemtra-hoadon";
const KEY_USER: &str = "openai";
const DEFAULT_MODEL: &str = "gpt-6-luna";

fn failed(note: impl Into<String>) -> AiItem {
    AiItem::Failed { date: None, note: note.into() }
}

#[tauri::command]
fn startup_file(state: tauri::State<'_, StartupFile>) -> Option<String> {
    state.take()
}

#[tauri::command]
fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|error| format!("Không đọc được file: {error}"))
}

#[tauri::command]
fn save_next_to(source_path: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = Path::new(&source_path)
        .parent()
        .ok_or_else(|| "Không xác định được thư mục của file gốc".to_string())?;
    let target = next_free_path(dir, &file_name, |candidate| candidate.exists());
    std::fs::write(&target, bytes).map_err(|error| format!("Không lưu được file: {error}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_result(path: String) -> Result<(), String> {
    if !path.to_lowercase().ends_with(".xlsx") || !Path::new(&path).is_file() {
        return Err("Không tìm thấy file kết quả".to_string());
    }
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|error| format!("Không mở được file: {error}"))
}

#[tauri::command]
fn save_as(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|error| format!("Không lưu được file: {error}"))
}

fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_USER).map_err(|error| error.to_string())
}

fn read_key() -> Option<String> {
    key_entry().ok()?.get_password().ok().filter(|key| !key.trim().is_empty())
}

#[tauri::command]
fn ai_key_status() -> Option<String> {
    read_key().map(|key| mask_key(&key))
}

#[tauri::command]
fn set_ai_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("Khóa trống".to_string());
    }
    key_entry()?.set_password(key).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_ai_key() -> Result<(), String> {
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map(|dir| dir.join("config.json")).map_err(|error| error.to_string())
}

fn read_model(app: &tauri::AppHandle) -> String {
    config_path(app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|config| config["model"].as_str().map(str::to_owned))
        .filter(|model| !model.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

#[tauri::command]
fn get_model(app: tauri::AppHandle) -> String {
    read_model(&app)
}

#[tauri::command]
fn set_model(app: tauri::AppHandle, model: String) -> Result<(), String> {
    let path = config_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    let config = serde_json::json!({ "model": model.trim() });
    std::fs::write(path, config.to_string()).map_err(|error| error.to_string())
}

async fn ask_one(client: &reqwest::Client, key: &str, model: &str, text: &str) -> AiItem {
    let mut attempt = 0;
    loop {
        let (note, retry_after) = match client.post(OPENAI_URL).bearer_auth(key).json(&request_body(model, text)).send().await {
            Err(_) => ("Không gọi được AI".to_string(), None),
            Ok(response) if response.status().is_success() => {
                return match response.json::<Value>().await {
                    Ok(payload) => AiItem::Answer { answer: output_text(&payload) },
                    Err(_) => failed("Không gọi được AI"),
                };
            }
            Ok(response) => {
                let status = response.status().as_u16();
                if !is_retryable(status) {
                    return failed(note_for_status(status));
                }
                let retry_after = response.headers().get("retry-after").and_then(|v| v.to_str().ok()).map(str::to_owned);
                (note_for_status(status), retry_after)
            }
        };
        if attempt >= MAX_RETRIES {
            return failed(note);
        }
        tokio::time::sleep(retry_delay(attempt, retry_after.as_deref())).await;
        attempt += 1;
    }
}

#[tauri::command]
async fn ask_ai(app: tauri::AppHandle, texts: Vec<String>, limits: Limits) -> AiAnswer {
    let Some(key) = read_key() else { return AiAnswer::Disabled };
    let model = read_model(&app);
    let limits = limits.effective();
    if texts.is_empty() || texts.len() > limits.max_texts {
        return AiAnswer::Failed;
    }
    let Ok(client) = reqwest::Client::builder().timeout(TIMEOUT).build() else { return AiAnswer::Failed };
    let texts: Vec<String> = texts.into_iter().map(|text| text.chars().take(limits.max_text_length).collect()).collect();
    let results = stream::iter(texts)
        .map(|text| {
            let client = client.clone();
            let key = key.clone();
            let model = model.clone();
            async move { ask_one(&client, &key, &model, &text).await }
        })
        .buffered(limits.concurrency)
        .collect()
        .await;
    AiAnswer::Ok { results }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let startup = startup_xlsx(&args, |path| path.is_file());
    update::remove_leftover();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(StartupFile(Mutex::new(startup)))
        .invoke_handler(tauri::generate_handler![
            startup_file,
            read_file,
            save_next_to,
            save_as,
            open_result,
            update::check_update,
            update::install_update,
            ai_key_status,
            set_ai_key,
            delete_ai_key,
            get_model,
            set_model,
            ask_ai
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashSet;

    #[test]
    fn request_body_uses_the_fixed_prompt_token_cap_and_no_storage() {
        assert_eq!(
            request_body("gpt-6-luna", "Thuê phòng nghỉ"),
            json!({
                "model": "gpt-6-luna",
                "instructions": PROMPT,
                "input": "Thuê phòng nghỉ",
                "max_output_tokens": 1000,
                "store": false
            })
        );
    }

    #[test]
    fn output_text_joins_output_text_parts_only() {
        let payload = json!({
            "output": [
                { "type": "reasoning", "content": [{ "type": "reasoning_text", "text": "thinking" }] },
                { "type": "message", "content": [{ "type": "output_text", "text": "02/05" }, { "type": "output_text", "text": "/2025" }] }
            ]
        });
        assert_eq!(output_text(&payload), "02/05/2025");
        assert_eq!(output_text(&json!({})), "");
    }

    #[test]
    fn note_for_status_explains_a_bad_key() {
        assert_eq!(note_for_status(401), "Khóa OpenAI không hợp lệ");
        assert_eq!(note_for_status(429), "AI HTTP 429");
        assert_eq!(note_for_status(500), "AI HTTP 500");
    }

    #[test]
    fn rate_limits_and_server_errors_are_retried_with_backoff() {
        assert!(is_retryable(429) && is_retryable(500) && is_retryable(503));
        assert!(!is_retryable(400) && !is_retryable(401));
        let waits: Vec<u64> = (0..MAX_RETRIES).map(|n| retry_delay(n, None).as_secs()).collect();
        assert_eq!(waits, [1, 2, 4]);
        assert_eq!(retry_delay(0, Some("7")), Duration::from_secs(7));
        assert_eq!(retry_delay(0, Some("600")), Duration::from_secs(30));
        assert_eq!(retry_delay(1, Some("Wed, 21 Oct 2026 07:28:00 GMT")), Duration::from_secs(2));
    }

    #[test]
    fn next_free_path_never_overwrites() {
        let dir = Path::new("/data/Hóa đơn");
        let taken: HashSet<PathBuf> = [
            dir.join("XUAT HDDT BAN RA_ket_qua.xlsx"),
            dir.join("XUAT HDDT BAN RA_ket_qua (1).xlsx"),
        ]
        .into_iter()
        .collect();
        let exists = |p: &Path| taken.contains(p);
        assert_eq!(next_free_path(dir, "other.xlsx", exists), dir.join("other.xlsx"));
        assert_eq!(
            next_free_path(dir, "XUAT HDDT BAN RA_ket_qua.xlsx", exists),
            dir.join("XUAT HDDT BAN RA_ket_qua (2).xlsx")
        );
        let none_taken = |_: &Path| false;
        assert_eq!(next_free_path(dir, "no-extension", none_taken), dir.join("no-extension"));
    }

    #[test]
    fn startup_xlsx_accepts_spaces_vietnamese_and_upper_case() {
        let all_exist = |_: &Path| true;
        let args = |path: &str| vec!["kiemtra-hoadon.exe".to_string(), path.to_string()];
        assert_eq!(
            startup_xlsx(&args(r"C:\Hóa đơn\XUAT HDDT BAN RA.xlsx"), all_exist),
            Some(r"C:\Hóa đơn\XUAT HDDT BAN RA.xlsx".to_string())
        );
        assert_eq!(startup_xlsx(&args(r"C:\a\B.XLSX"), all_exist), Some(r"C:\a\B.XLSX".to_string()));
        assert_eq!(startup_xlsx(&args(r"C:\a\notes.txt"), all_exist), None);
        assert_eq!(startup_xlsx(&args(r"C:\a\gone.xlsx"), |_: &Path| false), None);
        assert_eq!(startup_xlsx(&["kiemtra-hoadon.exe".to_string()], all_exist), None);
    }

    #[test]
    fn mask_key_keeps_only_the_last_four_characters() {
        assert_eq!(mask_key("sk-proj-abcdef1234"), "1234");
        assert_eq!(mask_key("abc"), "abc");
    }

    #[test]
    fn limits_are_clamped_to_one_and_the_ceilings() {
        let asked = Limits { max_texts: 200_000, max_text_length: 0, concurrency: 999 };
        assert_eq!(asked.effective(), Limits { max_texts: 100_000, max_text_length: 1, concurrency: 100 });
    }

    #[test]
    fn answers_serialise_to_the_contract_the_frontend_reads() {
        let answer = AiAnswer::Ok {
            results: vec![
                AiItem::Answer { answer: "02/05/2025".into() },
                AiItem::Failed { date: None, note: "AI HTTP 429".into() },
            ],
        };
        assert_eq!(
            serde_json::to_value(answer).unwrap(),
            json!({ "status": "ok", "results": [{ "answer": "02/05/2025" }, { "date": null, "note": "AI HTTP 429" }] })
        );
        assert_eq!(serde_json::to_value(AiAnswer::Disabled).unwrap(), json!({ "status": "disabled" }));
    }

    #[test]
    fn the_startup_file_is_handed_out_once() {
        let state = StartupFile(Mutex::new(Some("C:\\a.xlsx".into())));
        assert_eq!(state.take(), Some("C:\\a.xlsx".to_string()));
        assert_eq!(state.take(), None);
    }
}
