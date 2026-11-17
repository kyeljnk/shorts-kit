; Shorts Kit Studio — Inno Setup 6 Installer Script
#define AppName "Shorts Kit Studio"
#define AppVersion "0.1.0"
#define AppPublisher "Shorts Kit Team"
#define AppExeName "ShortsKit.exe"

[Setup]
AppId={{8F6C2B4D-9E12-4A7B-B3C1-77D2F4A91E01}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\ShortsKit
DefaultGroupName={#AppName}
AllowNoIcons=yes
PrivilegesRequired=lowest
OutputDir=..\dist-installer
OutputBaseFilename=ShortsKit-Setup-{#AppVersion}
SetupIconFile=..\desktop\launcher\app.ico
UninstallDisplayIcon={app}\{#AppExeName}
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Cài đặt {#AppName}
WelcomeLabel2=Trình cài đặt sẽ đưa {#AppName} cùng toàn bộ công cụ tạo video ngắn AI (Bun, FFmpeg, Remotion và bộ kỹ năng Codex/ChatGPT) lên máy tính của bạn.%n%nKhông cần cài thêm phần mềm phụ trợ hoặc gõ dòng lệnh.
FinishedHeadingLabel=Đã cài đặt xong {#AppName}!
FinishedLabel=Bạn có thể mở {#AppName} từ Desktop hoặc Start Menu để nhập API key và bắt đầu tạo video với Codex / ChatGPT Desktop App.

[Tasks]
Name: "desktopicon"; Description: "Tạo biểu tượng ngoài màn hình Desktop"; GroupDescription: "Tiện ích:"

[Files]
Source: "..\.build-installer\stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\app.ico"
Name: "{group}\Thư mục dự án ShortsKit"; Filename: "{userdocs}\ShortsKit"
Name: "{group}\Gỡ cài đặt {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Mở {#AppName} ngay bây giờ"; Flags: nowait postinstall skipifsilent
