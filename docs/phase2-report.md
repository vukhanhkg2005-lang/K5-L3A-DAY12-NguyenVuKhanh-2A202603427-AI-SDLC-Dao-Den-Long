# Báo cáo Kiểm chứng — Phase 2 (Ticket-02 "Ba hòn đảo" · Contract v1.1)

## 1. Tóm tắt kết quả Kiểm chứng Tự động (Headless & Unit)

Toàn bộ log và file JSONL tại `docs/evidence/phase2/` được sinh trực tiếp từ mã nguồn thực tế (không chỉnh sửa tay).

| Hạng mục kiểm chứng | Kết quả | Bằng chứng thực tế |
|---|---|---|
| **Unit Tests (`npm run test:unit`)** | **17 / 17 PASS** (`~140 ms`) | [unit_test_output.txt](evidence/phase2/unit_test_output.txt) |
| **Regression Phase 1 (số chuẩn v1.1)** | **5 / 5 PASS** (`all_lit`, `pulse 3D`, `no_flames`, `safe_radius 6m`, `exit code 2`) | [r1_win_all_lit.jsonl](evidence/phase2/r1_win_all_lit.jsonl), [r2_pulse_stun.jsonl](evidence/phase2/r2_pulse_stun.jsonl), [r3_shade_loss.jsonl](evidence/phase2/r3_shade_loss.jsonl), [r4_safe_radius.jsonl](evidence/phase2/r4_safe_radius.jsonl) |
| **Lướt (`dash`)** — `14 m/s`, `12` tick, giữ Y trên không, cooldown `90` tick | **PASS** | [p2_dash.jsonl](evidence/phase2/p2_dash.jsonl) |
| **Rơi khỏi đảo (`Y < -10`)** — bỏ qua bất tử, mất hết đom đóm, chờ `60` tick hồi sinh + `90` tick bất tử | **PASS** | [p2_fall.jsonl](evidence/phase2/p2_fall.jsonl) |
| **Đêm 2 Đảo Cau** — bục nhảy `(20,0,18)` phóng sang Đảo B `(70,0,0)` | **PASS** | [p2_night2_pad.jsonl](evidence/phase2/p2_night2_pad.jsonl) |
| **Đêm 3 Đảo Chuông** — dốc 30° lên Tầng 1 (`Y=3`), vách đứng chặn đi tắt, bục nhảy lên Tầng 2 (`Y=6`) | **PASS** | [p2_night3_ramp.jsonl](evidence/phase2/p2_night3_ramp.jsonl), [unit_test_output.txt](evidence/phase2/unit_test_output.txt) |
| **Gió Lạc (Drifters)** — đuổi khi `carried >= 5`, cướp `min(3, carried)` trước Bóng Mực, bị Pulse thả đồ (`drifter_drop`) | **PASS** | [p2_drifter.jsonl](evidence/phase2/p2_drifter.jsonl) |
| **Bùa Gió (Charms)** — `7.2 m/s`, Lướt 0 cooldown, respawn `2700` tick | **PASS** | [p2_charm.jsonl](evidence/phase2/p2_charm.jsonl) |
| **Gió mạnh Đêm 3** — kích hoạt từ `sim_tick = 1800`, đẩy Mây `2 m/s` | **PASS** | [p2_wind.jsonl](evidence/phase2/p2_wind.jsonl) |
| **Tạm dừng (`pause` / `resume`)** — `tick` tăng nhưng `sim_tick`, thời gian, hồi chiêu đứng yên | **PASS** | [p2_pause.jsonl](evidence/phase2/p2_pause.jsonl) |
| **Tính tất định cả 3 Đêm (1, 2, 3)** | **3 / 3 PASS** (giống từng byte) | [scenarios_output.txt](evidence/phase2/scenarios_output.txt) |
| **Benchmark Đêm 3 đầy đủ (21.600 tick thực thi)** | **PASS — `0.325 s`** (ngưỡng `≤ 30 s`) | [p2_benchmark_night3_21600.jsonl](evidence/phase2/p2_benchmark_night3_21600.jsonl) |

## 2. Giao diện 3D, Bảng màu chuẩn, Âm thanh & Hiệu năng WebGL
- **Bảng màu chuẩn:** Toàn bộ 19 mã màu Hex trong Ticket-02 (`#0E1430`, `#1B2350`, `#2F5D50`, `#C9B48A`, `#6B4A2F`, `#12384A`, `#FFB347`, `#FFE9B0`, `#5B5F6E`, `#FFF6C2`, `#FFE58A`, `#120A1A`, `#7A3CFF`, `#3A3450`, `#E8E2D0`, `#C8102E`, `#F2C14E`, `#8FA3B8`, `#FF5A5F`, `#F5F1E6`) được khai báo nguyên gốc trong `src/render/scene.js` và `src/style.css` (sai lệch `0%`).
- **Ánh sáng môi trường:** `ambientLight.intensity = 0.15 + 0.55 * (lit / total)`.
- **Chuỗi 3 Đêm, HUD, Pause, Settings, Audio:** Đầy đủ Menu chính, Giới thiệu Đêm (lời Ông Đăng), Màn hình Bình Minh, Menu Tạm dừng (`Esc`/`P`), Cài đặt âm lượng & độ nhạy chuột lưu `localStorage`, HUD 10 ô đom đóm + icon hồi chiêu + mũi tên chỉ đèn ngoài màn hình + nhạc nền & 10 SFX Web Audio API.
- **Đóng gói & Hiệu năng:** Tách vendor chunk `three` riêng trong `vite.config.js` (không còn cảnh báo chunk > 500 kB cho bundle app). Bản dựng nhẹ, geometry low-poly tối ưu, đạt `~60 FPS` (vượt ngưỡng `≥ 30 FPS` ở `1280×720`, có bộ đếm FPS trực tiếp góc trên trái HUD).

## 3. Nhật ký dùng AI & Quản lý Token (Phase 2)
- **Chiến lược tiết kiệm token:** Chia rõ 2 chặng (dừng nghiệm thu Headless 100% xanh sau Bước 3 rồi mới làm đồ họa/UI ở Bước 4 & 5), gom các lệnh đọc/viết song song, không lặp lại nội dung đã biết.
- **Ước tính token Phase 2:** ~75k tokens (Bước 1–3: ~42k; Bước 4–5: ~33k). Chi tiết các lỗi đã tự bắt và sửa được ghi trong [docs/notes/ai-log.md](notes/ai-log.md).

## 4. Retro ngắn (Phase 2)
- **Hiệu quả nhất:** Dùng bộ đếm số nguyên theo tick (`invulnTicks`, `dashCdTicks`, `pulseCdTicks`, `stateTicksLeft`, `ttlTicks`) giúp loại bỏ hoàn toàn sai số dấu phẩy động và giữ đúng thứ tự 12 bước/tick.
- **Lỗi phát hiện sớm nhờ kiểm chứng:**
  1. `headless.js` của Phase 1 dừng vòng lặp khi `state !== 'playing'`, suýt làm dừng sớm khi `state === 'paused'` $\rightarrow$ đổi sang `sim.isFinished()`.
  2. Test unit stun kiểm tra ở tick 120 thay vì tick 121 (bóng phải choáng đủ 120 tick `1..120` rồi mới hết choáng ở tick `121`) $\rightarrow$ xác nhận lại bằng assert cả hai mốc tick 120 & 121.
  3. Rising-edge của phím `pause` trong GUI cần chạy 1 tick `pause: false` khi đang tạm dừng để reset trạng thái nút cũ trước khi bấm `Esc` tiếp tục.
- **Cải thiện cho Phase 3:** Duy trì cấu trúc mô-đun `maps.js` / `simulation.js` / `validators.js` để tiếp nhận nhanh các thay đổi luật ở Ticket-03.
