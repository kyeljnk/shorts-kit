use std::env;
use std::path::PathBuf;
use std::process::Command;

fn find_rc() -> Option<PathBuf> {
    let base = PathBuf::from(r"C:\Program Files (x86)\Windows Kits\10\bin");
    if let Ok(entries) = std::fs::read_dir(&base) {
        let mut versions: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|x| x.path())).collect();
        versions.sort();
        versions.reverse();
        for v in versions {
            let rc = v.join("x64").join("rc.exe");
            if rc.is_file() {
                return Some(rc);
            }
        }
    }
    None
}

fn main() {
    println!("cargo:rerun-if-changed=app.rc");
    println!("cargo:rerun-if-changed=app.ico");
    if let Some(rc) = find_rc() {
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
        let res = out_dir.join("app.res");
        let status = Command::new(rc)
            .args(["/fo", res.to_str().unwrap(), "app.rc"])
            .status()
            .expect("failed to run rc.exe");
        if status.success() {
            println!("cargo:rustc-link-arg={}", res.display());
        }
    }
}
