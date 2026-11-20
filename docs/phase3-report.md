# Báo cáo Kiểm chứng — Phase 3 (Ticket-03 "Đèn cạn dầu" · Contract v1.2)

## 1. Tóm tắt kết quả Kiểm chứng Thực tế

Tất cả file log và JSONL tại [docs/evidence/phase3/](evidence/phase3/) được sinh trực tiếp từ mã nguồn hiện tại (không chỉnh sửa tay, không `.skip()` bất kỳ test nào).

| Hạng mục kiểm chứng | Kết quả | Bằng chứng thực tế |
|---|---|---|
| **Unit Tests (`npm run test:unit`)** | **14 / 14 PASS** (`141.0 ms`, `0` skipped) | [unit_test_output.txt](evidence/phase3/unit_test_output.txt) |
| **Regression Phase 1–2 không bị thay thế** | **PASS 100%** (di chuyển, nhảy, lướt, rơi đảo, bục nhảy Đêm 2/3, dốc & vách Đêm 3, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng, `safe_radius = 6m` khi `fuel ≥ 30`, mã lỗi `2`) | [scenarios_output.txt](evidence/phase3/scenarios_output.txt), [r2_pulse_stun.jsonl](evidence/phase3/r2_pulse_stun.jsonl), [r3_shade_loss.jsonl](evidence/phase3/r3_shade_loss.jsonl), [r4_safe_radius.jsonl](evidence/phase3/r4_safe_radius.jsonl) |
| **Nhiên liệu nguyên `1/60`, `lantern_out`, thắp lại tốn `5` (`+40`), sức chứa `10 → 12 → 20`** | **PASS** (đèn `fuel=1` tắt đúng tick `60`, thắp lại tick `66` tốn `5`, `relight: true`, `relit_count: 1`, `capacity: 12`, điểm `65`) | [p3_fuel_relight.jsonl](evidence/phase3/p3_fuel_relight.jsonl) |
| **Châm dầu (`refuel`) & khôi phục vùng an toàn đẩy Bóng Mực** | **PASS** (`used = 8`, `fuel = 100`, `+40` điểm, Bóng Mực đang `drain` bị đẩy ra ngoài `6 m` trong `≤ 30` tick không gây sát thương) | [p3_refuel_pushout.jsonl](evidence/phase3/p3_refuel_pushout.jsonl) |
| **Bóng Mực `wander → drain` đèn yếu (`< 30`), `fuel_drain` mỗi `60` tick & Pulse `+15`** | **PASS** (`P3-3a`: `S1` tự đi vào đèn yếu, phát `fuel_drain` mỗi `60` tick; `P3-3b`: Pulse trúng `S1` đang `drain` cộng `+15` điểm) | [p3_shade_drain.jsonl](evidence/phase3/p3_shade_drain.jsonl), [p3_drain_pulse_bonus.jsonl](evidence/phase3/p3_drain_pulse_bonus.jsonl) |
| **Luật thắng mới (`dawn_survived` vs `dawn` vs `no_flames`)** | **PASS** (thắp đủ 5 đèn ở tick `111` không kết thúc sớm; tới bình minh tick `180` thắng `dawn_survived` + điểm bình minh v1.2; `2/5` đèn sáng lúc bình minh thua `dawn`; hết máu đúng tick bình minh ưu tiên thua `no_flames`) | [r1_dawn_survived.jsonl](evidence/phase3/r1_dawn_survived.jsonl), [p3_dawn_loss.jsonl](evidence/phase3/p3_dawn_loss.jsonl) |
| **Tính tất định cả 3 Đêm (1, 2, 3)** | **3 / 3 PASS** (`seed=2026`, `1500` tick giống hệt từng byte) | [scenarios_output.txt](evidence/phase3/scenarios_output.txt) |
| **Benchmark Đêm 3 đầy đủ (18.000 tick = 300 s v1.2)** | **PASS — `0.320 s`** (ngưỡng `≤ 30 s`) | [p3_benchmark_night3_18000.jsonl](evidence/phase3/p3_benchmark_night3_18000.jsonl) |
| **Production Build & Giao diện 3D + Mù màu** | **PASS (`1.14 s`)** (`HTTP 200`, `HAS_COLORBLIND=true`, `HAS_GOAL=true`) | `npm run build` (`dist/assets/index-*.js` `59.87 kB`, `three` tách riêng) |

### Lệnh tái lập toàn bộ bằng chứng
```bash
npm ci && npm run build
npm test
node tests/run-scenarios.js --save-evidence
```

---

## 2. Danh sách Test cũ đã cập nhật & Lý do (Không bỏ qua âm thầm)

| Test / Scenario cũ | Lý do bị ảnh hưởng bởi Ticket-03 | Cách xử lý |
|---|---|---|
| `tests/sim.test.js` — test `deposit (+10/mote), lantern_lit (+100), win bonus score` | Luật v1.2 bỏ thắng sớm `all_lit`, đổi `per_mote` từ `+10` → `+5`, bỏ thưởng thời gian `per_second_left`, thay bằng thưởng bình minh `50 + floor(fuel)`. | Cập nhật thành `[P3 Updated] Lighting all 5 lanterns does NOT end early; wins at dawn (dawn_survived) with v1.2 score` kiểm chứng đúng cả hai: không thắng sớm & thắng `dawn_survived` (`840` điểm). |
| `tests/sim.test.js` — test `dawn timeout vs all_lit priority` | `all_lit` không còn tồn tại; luật mới ưu tiên `no_flames` > `dawn_survived` (`≥ 60%`) > `dawn` (`< 60%`). | Cập nhật thành `[P3 Updated] Dawn loss when lit < 60% and no_flames priority on exact dawn tick`. |
| `tests/scenarios/s1_win_all_lit.scenario.json` & test `S1` | Không thắng sớm tại tick `111`; cần chạy tới hết giờ (`time_left_s: 3` → tick `180`) để kiểm chứng `dawn_survived`. | Cập nhật `time_left_s: 3`, thêm `fuel: 80` cho `L2..L5`, và cập nhật kiểm tra `S1` xác nhận tick `180` trả `dawn_survived`. |
| `tests/scenarios/p2_bench_21600.scenario.json` & test Benchmark | Thời lượng Đêm 3 đổi từ `360 s` (`21.600` tick) → `300 s` (`18.000` tick). | Cập nhật `time_left_s: 300`, chạy đủ `18.000` tick thật (`0.320 s`). |

---

## 3. Giao diện 3D, HUD & Chế độ Mù màu (Bước 4)
- **Nhiên liệu & Trạng thái đèn không cần màu (`src/render/scene.js`):**
  - Đèn đang sáng có thanh dầu 3D billboarding phía trên; khi `fuel < 30` cả đèn lẫn thanh dầu nhấp nháy `1 Hz`, vòng an toàn `6 m` tắt đi; khi đèn cạn dầu tắt ánh sáng môi trường `0.15 + 0.55 × (lit/total)` tự giảm theo.
  - Đèn tắt luôn bị **xẹp 20% theo trục Y (`scale.y = 0.8`)** và phủ họa tiết **vết rách giấy đèn** sinh procedural (`createTornPaperTexture`), phân biệt rõ ràng không cần dựa vào màu sắc.
- **HUD động (`src/main.js`, `index.html`, `src/style.css`):**
  - Thanh đom đóm tự co giãn theo sức chứa động `10 → 20` (`đang mang / sức chứa`), hiển thị mục tiêu `CẦN ≥ k` và cảnh báo số đèn yếu, gợi ý ngữ cảnh `"E — Châm dầu (x/100)"` hoặc `"E — Thắp lại đèn (x/5)"`.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):**
  - Tích hợp trong menu Cài đặt và lưu `localStorage` (`ddl_settings_v2.colorblind`).
  - Khi bật: viền & mắt Bóng Mực đổi `#7A3CFF → #00B3FF`; màu cảnh báo UI đổi `#FF5A5F → #FFFFFF` kèm biểu tượng `⚠`.

---

## 4. Nhật ký AI, Token & Retro ngắn (Phase 3)
- **Ước tính token Phase 3:** `~55k tokens` (xem chi tiết tại [docs/notes/ai-log.md](notes/ai-log.md)).
- **Kiến trúc & Quyết định thiết kế:** Lưu tại [docs/adr/001-lantern-fuel-and-dawn-win.md](adr/001-lantern-fuel-and-dawn-win.md) và [CHANGELOG.md](../CHANGELOG.md).
- **Retro ngắn:**
  - Kiến trúc tách rời `src/sim/` và bộ đếm số nguyên từ Phase 2 giúp hấp thụ một Change Request thay đổi luật cốt lõi cực kỳ nhanh gọn mà không phá vỡ bất kỳ tính năng cũ nào của Phase 1–2.
  - Bài học quan trọng: việc dùng đơn vị nguyên `1/60` cho `fuelUnits` loại bỏ hoàn toàn rủi ro ranh giới `fuel == 30`, và việc tách kịch bản `P3-3a`/`P3-3b` ngay khi phát hiện Bóng Mực rời `drain` ở `≤ 6 m` giúp bằng chứng phản ánh trung thực 100% cơ chế thực tế.
