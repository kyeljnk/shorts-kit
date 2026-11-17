# Shorts Kit

Bộ công cụ làm video dọc có lời dẫn cho TikTok, YouTube Shorts và Reels. Mở thư mục dự án trong Codex để kiểm chứng dữ kiện, viết kịch bản, lên storyboard và xuất video bằng Remotion.

## Cài đặt trên Windows

Mở **PowerShell** và cài các công cụ bên dưới. Nếu đã có công cụ nào, bỏ qua dòng tương ứng.

```powershell
winget install -e --id Git.Git
winget install -e --id Oven-sh.Bun
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Gyan.FFmpeg
```

Đóng rồi mở lại PowerShell để nhận PATH mới. Đăng nhập bằng tài khoản GitHub đã được cấp quyền vào repo. Chạy các lệnh sau từ thư mục anh/chị muốn lưu bộ công cụ.

```powershell
git clone --branch noi-bo https://github.com/kyeljnk/shorts-kit.git
cd shorts-kit
bun install --frozen-lockfile
Copy-Item .env.example .env
bun run check
```

Trên macOS hoặc Linux, cài [Git](https://git-scm.com/downloads), [Bun](https://bun.sh/), [Node.js LTS](https://nodejs.org/) và [FFmpeg](https://ffmpeg.org/download.html). Dùng `cp .env.example .env` thay cho `Copy-Item`.

### Cấu hình giọng đọc

Mở tệp `.env` trong thư mục `shorts-kit` và điền khóa AI33 được cấp cho công việc vào dòng `AI33_API_KEY=`. Giọng mặc định cho dự án tiếng Việt là Vbee Minh Quân (`vbee_hn_male_minhquan_yt_24k-pre`). Kiểm tra kết nối bằng `bun run ai33 check`. Lệnh kiểm tra không tiêu credit, còn tạo lời đọc bằng `bun run tts <id>` có tính credit. Giữ `.env` và thư mục `.cache/` trên máy. Các biên nhận trong cache giúp tiếp tục tác vụ đã gửi khi cần chạy lại.

| Khóa tùy chọn trong `.env` | Dùng khi |
| --- | --- |
| `SERPER_API_KEY` | Tìm bài viết hoặc ảnh bằng `bun run search web "từ khóa"` hoặc `bun run search images "từ khóa"` |
| `PEXELS_API_KEY`, `PIXABAY_API_KEY` | Tìm ảnh và video stock bằng `bun run search pexels-video "từ khóa"` hoặc `bun run search pixabay-video "từ khóa"` |
| `FAL_KEY` | Tạo chuyển động bằng fal.ai. Kiểm tra kết nối và giá bằng `bun run fal check` trước khi gửi tác vụ tính phí |
| `GEMINI_API_KEY` | Phân tích video bằng `bun run gemini-video` |
| `ELEVENLABS_API_KEY` | Dùng ElevenLabs khi dự án chọn engine `elevenlabs` |

## Làm video đầu tiên

1. Mở **chính thư mục `shorts-kit`** trong Codex. Codex đọc [AGENTS.md](AGENTS.md) để chạy quy trình của bộ công cụ. Gửi đề bài kèm đối tượng xem, nền tảng, thời lượng và nguồn hoặc footage đã có. Ví dụ:

   > Làm video TikTok 45 giây bằng tiếng Việt về lý do ảnh chụp đêm hay bị nhòe. Dùng quy trình Shorts Kit. Cho tôi duyệt nguồn, kịch bản và storyboard trước khi dựng.

2. Duyệt các dữ kiện và quyền sử dụng ảnh/footage. Duyệt kịch bản trước khi tạo lời đọc, nghe lại lời đọc và xem storyboard trước khi dựng cảnh. Các dự án nằm trong `src/videos/<id>/`. Quy ước nội dung và trình bày của phòng nằm trong [SOUL.md](SOUL.md).
3. Khi đã duyệt bản dựng, yêu cầu Codex xuất MP4, ảnh bìa và nội dung đăng. Xem lại chữ, phụ đề, vùng an toàn và nghe âm thanh trên bản xuất trước khi đăng.
4. Lấy MP4, ảnh bìa và nội dung đăng trong `out/<id>/`. Người phụ trách đăng video thủ công và xử lý ghi nguồn theo hồ sơ bàn giao.

Nếu đã có lời thu hoặc footage, gửi đường dẫn tệp hoặc thư mục đó cho Codex. Chế độ chép lời và cắt tự động qua `bun run from` cần thêm [whisper.cpp](https://github.com/ggml-org/whisper.cpp), lệnh `whisper-cli` trên PATH và model `ggml-large-v3-turbo.bin` trong `.cache/whisper/`. Nghe lại tên riêng, con số và các điểm cắt trước khi duyệt. Xem [hướng dẫn làm việc với footage](docs/visuals/talking-head.md).

### Kiểm tra nhanh trước khi tạo lời đọc

```powershell
bun run facts
bun run still gallery --frame=0
```

Mở `out/gallery/still-0.png` để kiểm tra Remotion đã dựng được hình. Bước này không cần khóa AI. Lần chạy đầu có thể cần mạng để tải trình duyệt render và font. Dùng `bun run dev gallery` để xem các thành phần đồ họa mẫu.

## Lệnh thường dùng

Thay `<id>` bằng mã của video, ví dụ `anh-chup-dem`. Chạy lệnh từ thư mục gốc của repo.

| Lệnh | Kết quả |
| --- | --- |
| `bun run new <id> --flow H` | Tạo bộ khung dự án từ mẫu cấu trúc H |
| `bun run facts` / `bun run lint <id>` | Kiểm tra sổ dữ kiện và kịch bản |
| `bun run tts <id>` | Tạo `public/audio/<id>/voice.mp3` và mốc thời gian lời đọc |
| `bun run storyboard <id> --init` | Tạo bảng phân cảnh dựa trên lời đọc. Dùng `--sync` khi thay lời đọc |
| `bun run dev <id>` | Mở Remotion Studio cho video |
| `bun run still <id> --frame=0 --safe` | Xuất một khung hình để kiểm tra vùng an toàn |
| `bun run render <id>` | Xuất MP4 bản dựng |
| `bun run normalize <id>` rồi `bun run encode <id>` | Chuẩn hóa âm lượng và tạo `<id>-upload.mp4` |
| `bun run cover <id>` | Xuất `<id>-cover.png` và `<id>-cover.jpg` |
| `bun run preview --port 7790` | Xem dashboard duyệt kịch bản, storyboard, ảnh tĩnh và bản xuất |
| `bun run check` | Kiểm tra TypeScript và ranh giới import |

Codex viết `caption.txt`, `pinned-comment.txt` và ghi chú nguồn/bản quyền khi bàn giao. Xem [quy trình chi tiết](docs/making-a-video.md), [các cấu trúc kể chuyện](docs/flows/) và [các kiểu hình ảnh](docs/visuals/README.md).

## Chia sẻ trong phòng

- Chủ repo mời thành viên qua **Settings → Collaborators**. Mỗi người đăng nhập GitHub bằng tài khoản đã được mời rồi clone repo lên máy.
- Khi cập nhật bộ công cụ, chạy `git pull --ff-only` từ thư mục clone rồi chạy lại `bun install --frozen-lockfile`.
- Giữ khóa API, footage gốc và bản xuất trong khu vực được phòng cấp quyền. Khi góp thay đổi vào bộ công cụ, chỉ thêm tệp đã rà soát vào commit. Gửi bản xuất qua nơi bàn giao của phòng.

## Nguồn gốc và giấy phép

Bản này phát triển từ [shorts-kit của howznguyen](https://github.com/howznguyen/shorts-kit), theo [giấy phép MIT](LICENSE). SFX đi kèm dùng CC0. Ảnh vệ tinh mẫu của EOX (CC BY 4.0) cần ghi công khi sử dụng. Xem [ghi chú hình ảnh](public/img/README.md), [SFX](docs/sfx.md) và [nhạc](public/music/README.md) để đối chiếu điều kiện sử dụng tài nguyên. Phòng sử dụng Remotion theo [giấy phép của Remotion](https://www.remotion.dev/license).
