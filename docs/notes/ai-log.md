# Nhật ký dùng AI & Quản lý Token

## Phase 1 (PRD-0 — Đảo Đèn Lồng)

### 1. Công cụ & Harness sử dụng
- **Trợ lý AI:** Antigravity Agent (Gemini).
- **Harness AI lưu trong repo:**
  - `AGENTS.md`: Quy tắc kiến trúc (tách `src/sim/` và `src/render/`, single source of truth từ `game.contract.json`, cấm `Math.random()` trong `src/sim/`, bất biến Test Contract v1.0).
  - `.claude/skills/verify-phase/SKILL.md`: Quy trình chạy test, scenario, build và lưu bằng chứng thật.
  - `.claude/settings.json`: Hook chạy tự động unit test (`PostToolUse`) và toàn bộ test (`Stop`).
  - `.github/workflows/ci.yml`: CI tự động chạy `npm ci && npm run build` và `npm test` trên Ubuntu mỗi lần push.

### 2. Ước tính Token & Cách tiết kiệm
| Giai đoạn trong Phase 1 | Ước tính Token (input + output) | Cách tiết kiệm đã áp dụng |
|---|---|---|
| Đọc tài liệu lab & phân tích `phase1.md` | ~18k tokens | Đọc song song toàn bộ file `.md` trong 1 lượt, bỏ qua nội dung thừa ngoài phạm vi. |
| Thiết kế & viết Core Sim + Headless CLI (`src/sim/`, `src/headless.js`) | ~14k tokens | Viết thuần JS ESM (0 dependency cho headless), batch tạo nhiều file trong 1 lượt gọi tool. |
| Viết Renderer 3D (`src/render/`, `index.html`, `src/main.js`) | ~16k tokens | Dùng hình khối procedural Three.js gọn nhẹ thay vì tải/xử lý asset nặng. |
| Viết Unit Test, Scenario CLI, chạy kiểm chứng & lưu bằng chứng | ~12k tokens | Dùng sẵn `node:test` tích hợp trong Node.js (không cài thêm framework test), gộp lệnh verify vào 1 lượt chạy. |
| **Tổng ước tính Phase 1** | **~60k tokens** (chi phí ước tính thấp) | Ngữ cảnh gọn (`AGENTS.md` ngắn ~30 dòng), lập kế hoạch rõ trước khi code nên không phải sửa đi sửa lại. |

### 3. Lỗi/vấn đề phát hiện trong quá trình làm với AI & cách xử lý
1. **Khác biệt shell Windows PowerShell 5.1 (`&&`):** Lệnh chạy gộp `npm test && npm run build` báo lỗi parser trên PowerShell 5.1 $\rightarrow$ chuyển sang tách bằng `;` khi chạy thủ công trên Windows, đồng thời giữ `&&` trong `package.json` (chạy qua `cmd`/`sh` nên tương thích cả Windows/macOS/Linux).
2. **Đặt `npm install` trong sandbox bị chặn mạng (`403 Forbidden`):** Chỉ cấp quyền chạy ngoài sandbox riêng cho bước `npm install`; toàn bộ bước test, headless và `vite build` chạy sạch cục bộ không cần mạng.
3. **Biên đảo cứng khi scenario đặt thực thể xa:** Chủ động phát hiện rủi ro nếu bài test ẩn đặt đèn/Bóng Mực ngoài bán kính mặc định `42 m` $\rightarrow$ thiết kế `effectiveIslandRadius = Math.max(42, maxEntityDist + 10)` ngay trong `src/sim/simulation.js`.
4. **Rơi đom đóm khi bị đánh (`hit_drop_ratio`):** Nếu sinh lại đom đóm ngay tại chân người chơi khi bị đánh thì ngay tick kế tiếp người chơi sẽ tự nhặt lại (làm sai `carried` và phát thêm `mote_picked` ngoài ý muốn) $\rightarrow$ thiết kế đom đóm rơi tan vào sương và ghi rõ giả định trong `docs/notes/phase-1-assumptions.md`.
