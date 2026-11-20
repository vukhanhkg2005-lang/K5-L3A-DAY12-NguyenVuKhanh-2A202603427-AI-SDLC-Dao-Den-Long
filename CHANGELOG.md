# Changelog — Đảo Đèn Lồng

## [v1.0.0 — Phase 4] — Ticket-04 "Bình minh: phát hành v1.0.0" (Contract v1.3)

### Added
- **Contract v1.3 (`game.contract.json`):** Bổ sung `bench_cmd` (`node src/bench.js`), `soak_cmd` (`node src/soak.js`) và nâng cấp `run_cmd` (`node src/run.js`) hỗ trợ cờ `--export-leaderboard <out.json>`.
- **Chế độ Benchmark 3D (`src/bench.js`, `src/sim/benchMode.js`):** Mở cửa sổ `1280×720` không toàn màn hình, tắt vsync (`--disable-frame-rate-limit --disable-gpu-vsync`), tải cảnh chuẩn Đêm 1 với đúng `200` Bóng Mực `wander` (seed `42`), `100` đom đóm, `L1–L3` sáng `fuel=100`, tắt hiệu ứng sáng tạo thêm, camera bay quỹ đạo tròn `R=30 m, Y=15 m` ngược chiều kim đồng hồ `15 s/vòng`, `3 s` khởi động + `--duration` giây đo đạc, xuất `bench.json`.
- **Tối ưu 3D (`THREE.InstancedMesh`):** Gom 200 Bóng Mực & 100 đom đóm từ ~1.200 draw calls xuống còn 6 draw calls, tăng mạnh `avg_fps` và `p1_low_fps`.
- **Soak Test 10 Đêm (`src/soak.js`):** Chạy liên tiếp 10 Đêm headless (`1 → 2 → 3` xoay vòng) với input ngẫu nhiên theo seed trong cùng tiến trình, tối ưu vòng lặp `step()` gần như zero-allocation để giữ ổn định RSS (`mem_end_mb <= 1.2 * mem_start_mb`, `crashes = 0`), xuất `soak.json`.
- **Bảng xếp hạng cục bộ (`src/leaderboard.js`, `src/run.js`):** Nhập tên `3–12` ký tự (`[A-Za-z0-9_]` + hỗ trợ tiếng Việt có dấu) sau màn hình Bình Minh hoặc khi thua, lưu bền vững trên đĩa (`~/.dao-den-long/leaderboard.json`), giữ Top 10 (điểm giảm dần, bằng điểm xếp ai đạt trước), màn hình xem từ Menu chính và lệnh xuất `--export-leaderboard`.
- **Khả năng tiếp cận (Accessibility):**
  - Đổi phím cho đủ 9 hành động, tự phát hiện trùng phím & cảnh báo, nút "Khôi phục mặc định", lưu `localStorage`.
  - Phụ đề & chỉ báo hình ảnh: Bóng Mực xuất hiện (kèm mũi tên hướng ở mép màn hình), gió sắp thổi, đếm ngược 10 s cuối, đèn `fuel < 30`.
  - Chế độ **Giảm chuyển động** (tắt rung camera, chớp màn hình, nhấp nháy).
  - Cỡ chữ UI tối thiểu `18 px` ở `1280×720` + tùy chọn **Chữ lớn (`×1.25`)**.
- **Nâng cấp Đồ họa 3D Cổ tích, Bình minh & Typography (`src/render/forest.js`, `src/render/vfx.js`, `src/render/scene.js`, `src/style.css`):** Rừng đêm 5 nhóm thực vật `InstancedMesh` (chừa khoảng trống lối đi/đèn), hiệu ứng Light Cone, hạt rừng, sương mặt đất, vệt Dash/Pulse/xoắn ốc nạp đèn, shader bình minh + mặt trời mọc khi qua màn, lộ nền 3D ngoài Menu chính, và đóng gói font `Be Vietnam Pro` offline hỗ trợ đầy đủ dấu tiếng Việt.
- **Đóng gói phát hành & Tài liệu:** Thêm `Dockerfile` & `.dockerignore`, cập nhật CI chạy thêm Soak Test & Leaderboard export, hoàn thiện `docs/retro.md`, `docs/phase4-report.md`, `docs/demo/demo.mp4` và `README.md`.

---

## [Phase 3] — Ticket-03 "Đèn cạn dầu" (Contract v1.2)

### Breaking Changes (Thay đổi phá vỡ tương thích so với Contract v1.1)
1. **Contract version:** Nâng cấp `game.contract.json` từ `"1.1"` lên `"1.2"`.
2. **Thời lượng Đêm rút ngắn:** `night1_duration_s: 240`, `night2_duration_s: 270`, `night3_duration_s: 300`.
3. **Luật thắng thay đổi (`[THAY THẾ]` `all_lit`):** Loại bỏ thắng sớm `"all_lit"`; thắng mới là `"dawn_survived"` khi còn sống tới bình minh với `≥ ceil(0.6 × tổng đèn)` đèn sáng (`3/5`, `4/6`, `5/7`); dưới ngưỡng thua `"dawn"`; hết Ngọn Lửa ưu tiên thua `"no_flames"`.
4. **Nhiên liệu đèn (`1/60` nguyên) & Châm dầu (`refuel`):** Đèn sáng hao `1.0/s`, cạn tắt (`lantern_out`), thắp lại tốn `5` (`ever_lit`). Châm dầu `+10/đom đóm`, bỏ qua đèn đầy.
5. **Vùng an toàn động & Bóng Mực `drain`:** Đèn `fuel < 30` mất vùng an toàn `6 m`; Bóng Mực `wander` áp sát `≤ 2 m` chuyển `drain` (`5/s`, phát `fuel_drain` mỗi `60` tick); châm dầu lên `≥ 30` đẩy Bóng Mực ra trong `≤ 30` tick.
6. **Công thức điểm v1.2:** `+5`/mote nạp, `+100` thắp mới, `+40` thắp lại, `+5` Pulse (`+15` nếu đang `drain`), thưởng bình minh `+(50 + floor(fuel))`/đèn sáng + `+50`/Ngọn Lửa (bỏ thưởng thời gian).

### Added
- Sức chứa động `min(20, 10 + 2 × successful_lights)`, chế độ mù màu (`#00B3FF`, `#FFFFFF + ⚠`), đèn tắt xẹp 20% + vết rách giấy, thanh dầu 3D & ADR-001.

---

## [Phase 2] — Ticket-02 "Ba hòn đảo" (Contract v1.1)
- Chuẩn hóa toàn bộ thông số vật lý & thứ tự 12 bước/tick.
- Thêm Đêm 2 (Đảo Cau) và Đêm 3 (Đảo Chuông), Lướt (`dash`), Rơi khỏi đảo, Bục nhảy, Gió Lạc, Bùa Gió, Gió mạnh, Tạm dừng, Cài đặt, HUD đầy đủ, bảng màu chuẩn và 10 SFX + nhạc nền.

---

## [Phase 1] — PRD-0 "Đảo Đèn Lồng" (Contract v1.0)
- Xây dựng bản chơi được Đêm 1 – Đảo Bến với kiến trúc tách biệt `src/sim/` và `src/render/`, chế độ headless CLI và bộ kiểm chứng ban đầu.
