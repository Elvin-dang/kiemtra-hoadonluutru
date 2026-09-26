use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROMPT: &str =
    "Trích xuất ngày kết thúc dịch vụ/check-out từ thông tin lưu trú. Chỉ trả về DD/MM/YYYY hoặc KHONG_XAC_DINH.";
pub const MAX_OUTPUT_TOKENS: u32 = 1000;
// Ceilings — the same as the website's server defaults.
pub const MAX_TEXTS: usize = 1000;
pub const MAX_TEXT_LENGTH: usize = 500;
pub const MAX_CONCURRENCY: usize = 10;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        let asked = Limits { max_texts: 5000, max_text_length: 0, concurrency: 99 };
        assert_eq!(asked.effective(), Limits { max_texts: 1000, max_text_length: 1, concurrency: 10 });
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
