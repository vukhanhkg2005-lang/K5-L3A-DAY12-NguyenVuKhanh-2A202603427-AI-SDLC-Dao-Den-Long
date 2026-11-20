# Báo cáo Kiểm chứng — Phase 4 (Ticket-04 "Bình minh: phát hành v1.0.0" · Contract v1.3)

## 1. Kết quả đo Benchmark 3D (`bench.json`)

- **Lệnh thực thi:** `node src/bench.js --seed 42 --duration 30 --out bench.json`
- **Cấu hình đo thực tế:** Windows 11 (`Windows_NT 10.0.26200 x64`), NVIDIA GeForce RTX 3050 Laptop GPU, Chrome `1280×720` non-fullscreen, VSync tắt (`--disable-frame-rate-limit --disable-gpu-vsync`), tắt toàn bộ hiệu ứng sáng tạo thêm (sao, mây trôi, audio, HUD).
- **Cảnh chuẩn:** Đêm 1, đúng `200` Bóng Mực `wander` (seed `42`), `100` đom đóm, `L1–L3` sáng `fuel=100`, camera quay tròn `R=30 m, Y=15 m` CCW `15 s/vòng`, `3 s` khởi động + `30 s` đo.

| Chỉ số | Kết quả đo thật ([bench.json](../bench.json)) | Ngưỡng Ticket-04 | Đánh giá |
|---|---:|---:|---|
| `avg_fps` | **882.8 FPS** | `≥ 60 FPS` | **Đạt (gấp 14.7×)** |
| `p1_low_fps` | **368.0 FPS** | `≥ 30 FPS` | **Đạt (gấp 12.3×)** |
| `frame_ms_p95` | **1.80 ms** | — | **Rất ổn định** |
| `frames` | **26,484** | — | **Đạt** |
| `load_ms` | **1,524 ms** | `≤ 10,000 ms` | **Đạt (nhanh gấp 6.6×)** |
| `vsync_off` | `true` | Tắt nếu cho phép | **Đạt** |
| `peak_mem_mb` | `null` | `null` hợp lệ cho bản web nếu giải thích | **Đã ghi rõ trong README** |

---

## 2. Kết quả Soak Test 10 Đêm (`soak.json`)

- **Lệnh thực thi:** `node --expose-gc src/soak.js --seed 7 --nights 10 --out soak.json`

| Chỉ số | Kết quả đo thật ([soak.json](../soak.json)) | Ngưỡng Ticket-04 | Đánh giá |
|---|---:|---:|---|
| `nights` | `10` (xoay vòng Đêm `1 → 2 → 3`) | `10` | **Đạt** |
| `crashes` | **`0`** | `= 0` | **Đạt** |
| `mem_start_mb` | `47.43 MB` | — | — |
| `mem_end_mb` | `50.51 MB` | `≤ 1.2 × mem_start_mb` (`56.92 MB`) | **Đạt (`1.065×`)** |
| `duration_s` | `0.247 s` | — | **Siêu nhanh** |

---

## 3. Kiểm chứng Bảng xếp hạng cục bộ, Accessibility & Hồi quy Phase 1–3

| Hạng mục | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| **Unit Tests (`npm run test:unit`)** | `node --test tests/sim.test.js` (16 tests, `0` skipped): gồm hồi quy P1–P3 + test cảnh bench `200` Shades/`100` Motes + test Leaderboard (validate tên `3–12` ký tự, tiếng Việt, sort giảm dần, tie-break đạt trước, top 10, export JSON) | [test_output.txt](evidence/phase4/test_output.txt) | **16 / 16 PASS** |
| **Headless Scenarios (`npm run test:scenarios`)** | Toàn bộ 15 kịch bản Contract v1.2/v1.3 (regression P1–P3, Determinism 3 Đêm, exit code `2`, benchmark 18.000 tick `0.306 s`) | [test_output.txt](evidence/phase4/test_output.txt) | **15 / 15 PASS** |
| **Xuất Leaderboard (`--export-leaderboard`)** | `node src/run.js --export-leaderboard docs/evidence/phase4/leaderboard_export.json` | [leaderboard_export.json](evidence/phase4/leaderboard_export.json) | **PASS (`{"entries": [...]}`)** |
| **Accessibility** | Đổi đủ 9 phím + báo trùng phím + nút Khôi phục mặc định (`localStorage`); Phụ đề + mũi tên mép màn hình khi Bóng Mực xuất hiện, báo gió, 10 s cuối, đèn `< 30` dầu; Chế độ Giảm chuyển động; Cỡ chữ UI `≥ 18 px` ở `1280×720` + Chữ lớn `×1.25`; Chế độ mù màu; Font `Be Vietnam Pro` `.woff2` | `index.html`, `src/style.css`, `src/main.js`, `src/render/scene.js` | **Đạt** |
| **Đóng gói, Video Demo & Tài liệu** | `npm ci && npm run build && npm start` (3 lệnh), `Dockerfile`, `CHANGELOG.md` đủ 4 phase, `CREDITS.md`, `LICENSE`, `docs/retro.md`, `README.md`, [demo.mp4](demo/demo.mp4) (`04:41`, `51.3 MB`) | `dist/` build `1.30 s` | **Đạt** |

---

## 4. Xác nhận phát hành `phase-4` & `v1.0.0`
Toàn bộ mã nguồn, `bench.json`, `soak.json`, bằng chứng kiểm thử (`docs/evidence/phase4/`), tài liệu retro/báo cáo và `docs/demo/demo.mp4` (`< 5 phút`, `< 100 MB`) đã hoàn tất kiểm tra khớp hoàn toàn với Contract v1.3 và tiêu chí Phase 4.
