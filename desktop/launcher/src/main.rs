#![windows_subsystem = "windows"]

use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[link(name = "user32")]
extern "system" {
    fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, utype: u32) -> i32;
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn show_error(msg: &str) {
    let wmsg = to_wide(msg);
    let wcap = to_wide("Shorts Kit Studio");
    unsafe {
        MessageBoxW(0, wmsg.as_ptr(), wcap.as_ptr(), 0x10);
    }
}

fn copy_dir_skip_nm(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str == "node_modules" || name_str == ".git" || name_str == ".cache" {
            continue;
        }
        let s = entry.path();
        let d = dst.join(&name);
        if entry.file_type()?.is_dir() {
            copy_dir_skip_nm(&s, &d)?;
        } else {
            // Never overwrite user's existing .env
            if name_str == ".env" && d.exists() {
                continue;
            }
            if !d.exists() {
                fs::copy(&s, &d)?;
            }
        }
    }
    Ok(())
}

fn ensure_workspace(template_dir: &Path, workspace_dir: &Path) -> Result<(), String> {
    if !workspace_dir.exists() {
        fs::create_dir_all(workspace_dir).map_err(|e| format!("Khong tao duoc thu muc lam viec: {e}"))?;
    }
    if template_dir.exists() && !workspace_dir.join("package.json").exists() {
        copy_dir_skip_nm(template_dir, workspace_dir)
            .map_err(|e| format!("Khong khoi tao duoc du an mau: {e}"))?;
    }
    // Create blank .env from .env.example if missing
    let env_file = workspace_dir.join(".env");
    let env_ex = workspace_dir.join(".env.example");
    if !env_file.exists() && env_ex.exists() {
        let _ = fs::copy(&env_ex, &env_file);
    }
    // Create node_modules junction if missing
    let nm_dst = workspace_dir.join("node_modules");
    let nm_src = template_dir.join("node_modules");
    if !nm_dst.exists() && nm_src.exists() {
        let cmd_str = format!(
            "mklink /J \"{}\" \"{}\"",
            nm_dst.display(),
            nm_src.display()
        );
        let status = Command::new("cmd")
            .args(["/C", &cmd_str])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if status.is_err() || !nm_dst.exists() {
            return Err("Khong tao duoc lien ket node_modules trong thu muc du an.".to_string());
        }
    }
    Ok(())
}

fn check_health(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    if let Ok(mut stream) = TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_millis(250)) {
        let req = format!("GET /api/health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
        if stream.write_all(req.as_bytes()).is_ok() {
            let mut buf = [0u8; 256];
            if let Ok(n) = stream.read(&mut buf) {
                let txt = String::from_utf8_lossy(&buf[..n]);
                return txt.contains("200 OK") && txt.contains("\"ok\":true");
            }
        }
    }
    false
}

fn find_free_port(start: u16) -> u16 {
    for p in start..(start + 20) {
        if TcpListener::bind(("127.0.0.1", p)).is_ok() {
            return p;
        }
    }
    start
}

fn find_browser_app() -> Option<PathBuf> {
    let candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ];
    for c in candidates {
        let p = PathBuf::from(c);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn open_app_window(url: &str, profile_dir: &Path) -> Option<Child> {
    if let Some(browser) = find_browser_app() {
        let _ = fs::create_dir_all(profile_dir);
        let child = Command::new(browser)
            .arg(format!("--app={url}"))
            .arg(format!("--user-data-dir={}", profile_dir.display()))
            .arg("--window-size=1360,880")
            .arg("--disable-features=msEdgeOnRamp")
            .spawn();
        if let Ok(c) = child {
            return Some(c);
        }
    }
    let _ = Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    None
}

fn main() {
    let exe_path = match env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            show_error(&format!("Khong xac dinh duoc vi tri phan mem: {e}"));
            return;
        }
    };
    let app_dir = exe_path.parent().unwrap_or_else(|| Path::new("."));
    let runtime_dir = app_dir.join("runtime");
    let studio_dir = app_dir.join("studio");
    let template_dir = app_dir.join("template");

    let bun_exe = runtime_dir.join("bun.exe");
    let server_script = studio_dir.join("studio-server.ts");

    if !bun_exe.is_file() || !server_script.is_file() {
        show_error("Thieu tep he thong (bun.exe hoac studio-server.ts). Vui long cai dat lai Shorts Kit Studio.");
        return;
    }

    let user_profile = env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".to_string());
    let local_app = env::var("LOCALAPPDATA").unwrap_or_else(|_| app_dir.to_string_lossy().to_string());
    let workspace_dir = PathBuf::from(&user_profile).join("Documents").join("ShortsKit");
    let profile_dir = PathBuf::from(&local_app).join("ShortsKit").join("webview-profile");

    if let Err(msg) = ensure_workspace(&template_dir, &workspace_dir) {
        show_error(&msg);
        return;
    }

    // If an instance is already serving on 7788, open window to it and exit
    if check_health(7788) {
        let _ = open_app_window("http://127.0.0.1:7788/", &profile_dir);
        return;
    }

    let port = find_free_port(7788);
    let orig_path = env::var("PATH").unwrap_or_default();
    let new_path = format!("{};{}", runtime_dir.display(), orig_path);

    let mut server = match Command::new(&bun_exe)
        .args([
            "run",
            server_script.to_str().unwrap(),
            "--workspace",
            workspace_dir.to_str().unwrap(),
            "--template",
            template_dir.to_str().unwrap(),
            "--dist-ui",
            studio_dir.join("dist-ui").to_str().unwrap(),
            "--port",
            &port.to_string(),
        ])
        .current_dir(&workspace_dir)
        .env("PATH", new_path)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            show_error(&format!("Khong khoi dong duoc Shorts Kit Studio server: {e}"));
            return;
        }
    };

    let deadline = Instant::now() + Duration::from_secs(15);
    let mut ready = false;
    while Instant::now() < deadline {
        if check_health(port) {
            ready = true;
            break;
        }
        thread::sleep(Duration::from_millis(150));
    }

    if !ready {
        let _ = server.kill();
        show_error("Shorts Kit Studio mat qua nhieu thoi gian de khoi dong. Vui long thu mo lai.");
        return;
    }

    let url = format!("http://127.0.0.1:{port}/");
    if let Some(mut browser_proc) = open_app_window(&url, &profile_dir) {
        let _ = browser_proc.wait();
        let _ = server.kill();
        let _ = server.wait();
    }
}
