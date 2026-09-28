//! Self-update for the portable .exe: GitHub's latest release, a minisign-signed download,
//! then swap the running file (Windows allows renaming a running .exe) and restart.

use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use serde_json::Value;

const RELEASES_URL: &str = "https://api.github.com/repos/Elvin-dang/kiemtra-hoadonluutru/releases/latest";
const EXE_ASSET: &str = "kiemtra-hoadon.exe";
const PUBLIC_KEY: &str = include_str!("../updater-key.pub");

#[derive(Serialize, Debug, PartialEq)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
}

#[derive(Debug, PartialEq)]
pub struct Release {
    pub version: String,
    pub notes: String,
    pub exe_url: String,
    pub sig_url: String,
}

pub fn parse_version(tag: &str) -> Option<(u64, u64, u64)> {
    let mut parts = tag.trim().trim_start_matches('v').split('.').map(|part| part.parse::<u64>().ok());
    let version = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(version)
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    matches!((parse_version(candidate), parse_version(current)), (Some(a), Some(b)) if a > b)
}

pub fn parse_release(payload: &Value) -> Option<Release> {
    let asset = |name: &str| -> Option<String> {
        let found = payload["assets"].as_array()?.iter().find(|asset| asset["name"] == name)?;
        found["browser_download_url"].as_str().map(str::to_owned)
    };
    Some(Release {
        version: payload["tag_name"].as_str()?.trim_start_matches('v').to_string(),
        notes: payload["body"].as_str().unwrap_or_default().to_string(),
        exe_url: asset(EXE_ASSET)?,
        sig_url: asset(&format!("{EXE_ASSET}.sig"))?,
    })
}

/// `signature` and `public_key` are the base64 texts `tauri signer` writes (.sig / .pub).
pub fn verify(data: &[u8], signature: &str, public_key: &str) -> Result<(), String> {
    let decode = |text: &str| {
        let bytes = base64::engine::general_purpose::STANDARD.decode(text.trim()).ok()?;
        String::from_utf8(bytes).ok()
    };
    let key = decode(public_key)
        .and_then(|text| minisign_verify::PublicKey::decode(&text).ok())
        .ok_or_else(|| "Khóa kiểm tra bản cập nhật không hợp lệ".to_string())?;
    let signature = decode(signature)
        .and_then(|text| minisign_verify::Signature::decode(&text).ok())
        .ok_or_else(|| "Chữ ký bản cập nhật không hợp lệ".to_string())?;
    key.verify(data, &signature, false).map_err(|_| "Chữ ký bản cập nhật không khớp".to_string())
}

pub fn sibling(current: &Path, suffix: &str) -> PathBuf {
    let mut name = current.as_os_str().to_owned();
    name.push(format!(".{suffix}"));
    PathBuf::from(name)
}

/// Writes `<exe>.new`, moves the current file to `<exe>.old`, then moves the new one into place.
/// If the last step fails the old file is put back, so the app is never left missing.
pub fn replace_exe(current: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let new = sibling(current, "new");
    let old = sibling(current, "old");
    std::fs::write(&new, bytes)?;
    let _ = std::fs::remove_file(&old);
    std::fs::rename(current, &old)?;
    if let Err(error) = std::fs::rename(&new, current) {
        let _ = std::fs::rename(&old, current);
        return Err(error);
    }
    Ok(())
}

/// The previous version's file, left behind by an update (it was still running then).
pub fn remove_leftover() {
    if let Ok(current) = std::env::current_exe() {
        let _ = std::fs::remove_file(sibling(&current, "old"));
    }
}

fn http(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("kiemtra-hoadon")
        .timeout(timeout)
        .build()
        .map_err(|error| error.to_string())
}

async fn download(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let response = client.get(url).send().await.and_then(|r| r.error_for_status());
    let bytes = match response {
        Ok(response) => response.bytes().await,
        Err(error) => Err(error),
    };
    bytes.map(|b| b.to_vec()).map_err(|_| "Không tải được bản cập nhật".to_string())
}

async fn newer_release() -> Result<Option<Release>, String> {
    let response = http(Duration::from_secs(15))?
        .get(RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| "Không kiểm tra được phiên bản mới".to_string())?;
    let payload: Value = response.json().await.map_err(|_| "Không kiểm tra được phiên bản mới".to_string())?;
    Ok(parse_release(&payload).filter(|release| is_newer(&release.version, env!("CARGO_PKG_VERSION"))))
}

/// None when up to date, offline, or GitHub is unreachable — the check never bothers the user.
#[tauri::command]
pub async fn check_update() -> Option<UpdateInfo> {
    let release = newer_release().await.ok()??;
    Some(UpdateInfo { version: release.version, notes: release.notes })
}

#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    if cfg!(debug_assertions) || !cfg!(windows) {
        return Err("Chỉ tự cập nhật được trên bản Windows đã phát hành.".to_string());
    }
    let release = newer_release().await?.ok_or_else(|| "Không có phiên bản mới.".to_string())?;
    let client = http(Duration::from_secs(300))?;
    let exe = download(&client, &release.exe_url).await?;
    let signature = String::from_utf8(download(&client, &release.sig_url).await?)
        .map_err(|_| "Chữ ký bản cập nhật không hợp lệ".to_string())?;
    verify(&exe, &signature, PUBLIC_KEY)?;
    let current = std::env::current_exe().map_err(|error| error.to_string())?;
    replace_exe(&current, &exe).map_err(|error| format!("Không thay được file ứng dụng: {error}"))?;
    std::process::Command::new(&current)
        .spawn()
        .map_err(|error| format!("Đã cập nhật, hãy mở lại ứng dụng: {error}"))?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const SAMPLE: &[u8] = include_bytes!("../test-data/sample.bin");
    const SAMPLE_SIG: &str = include_str!("../test-data/sample.bin.sig");

    #[test]
    fn versions_compare_numerically() {
        assert_eq!(parse_version("v1.10.0"), Some((1, 10, 0)));
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.3-beta"), None);
        assert!(is_newer("v1.10.0", "1.9.9"));
        assert!(!is_newer("1.1.0", "1.1.0"));
        assert!(!is_newer("1.0.9", "1.1.0"));
        assert!(!is_newer("nonsense", "1.1.0"));
    }

    #[test]
    fn a_release_needs_both_the_exe_and_its_signature() {
        let payload = json!({
            "tag_name": "v1.2.0",
            "body": "- Sửa lỗi",
            "assets": [
                { "name": "kiemtra-hoadon.exe", "browser_download_url": "https://x/exe" },
                { "name": "kiemtra-hoadon.exe.sig", "browser_download_url": "https://x/sig" }
            ]
        });
        assert_eq!(
            parse_release(&payload),
            Some(Release {
                version: "1.2.0".into(),
                notes: "- Sửa lỗi".into(),
                exe_url: "https://x/exe".into(),
                sig_url: "https://x/sig".into()
            })
        );
        let unsigned = json!({ "tag_name": "v1.2.0", "assets": [{ "name": "kiemtra-hoadon.exe", "browser_download_url": "https://x/exe" }] });
        assert_eq!(parse_release(&unsigned), None);
    }

    #[test]
    fn only_a_file_signed_with_the_release_key_is_accepted() {
        assert_eq!(verify(SAMPLE, SAMPLE_SIG, PUBLIC_KEY), Ok(()));
        let mut tampered = SAMPLE.to_vec();
        tampered[0] ^= 1;
        assert!(verify(&tampered, SAMPLE_SIG, PUBLIC_KEY).is_err());
        assert!(verify(SAMPLE, "not a signature", PUBLIC_KEY).is_err());
    }

    #[test]
    fn replace_exe_swaps_the_file_and_keeps_the_old_one_aside() {
        let dir = std::env::temp_dir().join(format!("kiemtra-update-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let current = dir.join("kiemtra-hoadon.exe");
        std::fs::write(&current, b"old").unwrap();
        std::fs::write(sibling(&current, "old"), b"older leftover").unwrap();

        replace_exe(&current, b"new").unwrap();

        assert_eq!(std::fs::read(&current).unwrap(), b"new");
        assert_eq!(std::fs::read(sibling(&current, "old")).unwrap(), b"old");
        assert!(!sibling(&current, "new").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
