# Retrospective Dự án — Đảo Đèn Lồng (Day 12 AI SDLC Lab · v1.0.0)

- **Sinh viên:** Nguyễn Vũ Khanh (`2A202603427`) · **Lớp:** K5-L3A
- **Phạm vi:** 4 Phase liên tiếp (`PRD-0` → `Ticket-02` → `Ticket-03` → `Ticket-04`, Contract `v1.0` → `v1.3`)

---

## 1. Tổng hợp Evaluation qua 4 Phase

| Phase | Mục tiêu chính | Kết quả Kiểm chứng Thực tế | Điểm nhấn kỹ thuật |
|---|---|---|---|
| **Phase 1** (`phase-1`, v1.0) | Màn Đêm 1 playable + Headless CLI tất định | 9/9 unit tests + 6/6 scenarios pass; `SHA-256` tất định trùng khớp; build `1.10 s` | Thiết lập kiến trúc tách tuyệt đối `src/sim/` thuần JS (0 dependency) và `src/render/` (Three.js), single source of truth `game.contract.json`. |
| **Phase 2** (`phase-2`, v1.1) | Chuẩn hóa vật lý + 3 Đêm (Đảo Bến, Cau, Chuông) + Dash, Drifters, Charms, Wind, HUD/Audio | 17/17 unit + 17/17 scenarios pass; Determinism 3 Đêm pass; Benchmark Đêm 3 `21.600` tick đạt `0.297 s` (`≤ 30 s`) | Chuyển toàn bộ bộ đếm sang số nguyên theo tick, tách bản đồ 3D/collision vào `src/sim/maps.js`, bảng màu Hex chuẩn `0%` sai lệch. |
| **Phase 3** (`phase-3`, v1.2) | Change Request "Đèn cạn dầu": nhiên liệu `1/60`, Bóng Mực `drain`, bỏ `all_lit` → `dawn_survived`, mù màu | 14/14 unit + 15/15 scenarios pass (`0` skipped); Benchmark `18.000` tick `0.335 s` | Lưu nhiên liệu bằng số nguyên `1/60` (`fuelUnits = 0..6000`) loại bỏ sai số số thực tại ngưỡng `fuel == 30`; ADR-001 & CHANGELOG minh bạch. |
| **Phase 4** (`phase-4`, v1.3) | Benchmark 3D `1280×720`, Soak Test 10 Đêm, Bảng xếp hạng cục bộ, Accessibility, Đóng gói `v1.0.0` | 16/16 unit + 15/15 scenarios pass; Soak `crashes = 0` & RSS ổn định; Bench `200` Shades + `100` Motes dùng `InstancedMesh` | Tối ưu 6 draw calls bằng `InstancedMesh`, tối ưu zero-allocation trong `step()`, hỗ trợ đổi phím/phụ đề/giảm chuyển động/chữ lớn `≥ 18 px`, lưu leaderboard cục bộ + `--export-leaderboard`. |

---

## 2. Điều hiệu quả & Chưa hiệu quả khi làm việc cùng AI

### Điều hiệu quả nhất
1. **Tách Sim/Render và thiết kế theo Test Contract ngay từ Phase 1:** Việc ép `src/sim/` không chạm DOM/Three.js giúp mọi phase sau (mở rộng 3 bản đồ, thay luật cốt lõi Phase 3, thêm Soak Test 10 Đêm Phase 4) chạy kiểm thử chỉ trong vài trăm mili-giây mà không cần mở trình duyệt.
2. **Chia chặng kiểm chứng (Verify Gate):** Đặc biệt ở Phase 2, dừng lại xác nhận Headless 100% xanh sau Bước 3 trước khi làm 3D/UI ở Bước 4 giúp không bị sửa dây chuyền khi logic còn lỗi.
3. **Viết tiêu chí nghiệm thu & ADR trước khi code:** Giúp AI bám sát từng con số bắt buộc (thứ tự 12 bước/tick, đơn vị `1/60`, mã màu Hex, công thức `p1_low_fps`) thay vì tự suy diễn.

### Điều chưa hiệu quả / Rút kinh nghiệm
1. **Giả định quá sớm ở Phase 1 có thể bị thay ở Phase sau:** Một vài giả định như tính `per_mote` lúc nhặt (Phase 1) hay tắt `fall_enabled` đều bị chuẩn hóa lại ở Phase 2 và thay lần nữa ở Phase 3. Bài học là giữ code mô-đun và gom hằng số về 1 nơi (`game.contract.json`) để chi phí đổi luật thấp nhất.
2. **Tối ưu bộ nhớ V8 khi chạy Soak Test tốc độ cao:** Lần chạy Soak đầu tiên dù không có memory leak thật nhưng vẫn tăng RSS ~23% vì cấp phát nhiều object tạm (`{x,z,blocked}`, `[...shades].sort()`, closure trong `step()`). Chỉ khi khử cấp phát tạm trong hot loop thì RSS mới phẳng tuyệt đối.

---

## 3. Những lần AI sai & Cách phát hiện

| Lỗi phát hiện | Giai đoạn | Cách phát hiện | Cách khắc phục & Ngăn lặp lại |
|---|---|---|---|
| Dùng `&&` trên PowerShell 5.1 gây lỗi cú pháp shell | Phase 1 | Chạy lệnh thật thất bại | Dùng `;` + kiểm tra `$LASTEXITCODE` trên Windows, vẫn giữ `&&` trong `package.json`. |
| `headless.js` thoát vòng lặp khi `state !== 'playing'` (làm gãy tính năng `paused`) | Phase 2 | Review thứ tự 12 bước trước khi chạy test | Thay bằng `sim.isFinished()` (`won` hoặc `lost`). |
| Tick thứ 12 của cú Lướt trên không bị chịu trọng lực do tính `isDashingThisTick` sau khi giảm biến đếm | Phase 2 | Rà soát logic + unit test kiểm tra Y suốt 12 tick | Đọc `isDashingThisTick` trước khi trừ `dashTicksLeft`. |
| Off-by-1 trong unit test kiểm tra 120 tick choáng (`tick 120` vẫn phải đang choáng, `tick 121` mới tỉnh) | Phase 2 | Chạy `npm run test:unit` báo fail rõ dòng | Assert cả hai mốc `tick 120` và `tick 121`. |
| Scenario `p3_shade_drain_pulse` đặt Mây cách Bóng Mực `4.12 m ≤ 6 m` khiến bóng bỏ `drain` sang `chase` ở tick 1 | Phase 3 | Chạy scenario thật thấy không có `fuel_drain` ở tick 60 | Tách rõ 2 kịch bản `P3-3a` (`wander → drain` khi Mây ở xa) và `P3-3b` (Pulse ngay tick 0 trên bóng đang `drain`). |
| V8 semi-space nở > `1.2×` trong Soak Test 10 Đêm do tạo object tạm mỗi tick | Phase 4 | Chạy thật `soak.js` và đo tỉ lệ `mem_end_mb / mem_start_mb = 1.238` | Tái sử dụng scratch object `_moveRes`, bỏ `[...shades].sort()` lặp mỗi tick, tách `findClosestWeakLantern` không tạo closure. |

---

## 4. Harness AI nào giúp ích nhiều nhất?

1. **`AGENTS.md` (hữu ích nhất):** Giữ ngắn gọn (~40–50 dòng), luôn được cập nhật đầu mỗi Phase với bất biến của Contract (`v1.0` → `v1.3`), quy tắc cấm `Math.random()` trong `src/sim/`, và quy tắc cấm `.skip()` test cũ. Nhờ vậy agent không bao giờ phá kiến trúc sim/render.
2. **Skill `.claude/skills/verify-phase/SKILL.md` & Hook `.claude/settings.json`:** Chuẩn hóa chuỗi kiểm chứng bắt buộc (unit test → scenarios → soak/bench → build) và chặn kết thúc khi test còn đỏ.
3. **CI GitHub Actions (`.github/workflows/ci.yml`):** Đảm bảo dự án chạy sạch trên môi trường Linux Ubuntu độc lập mỗi lần push (không phụ thuộc máy Windows cá nhân).

---

## 5. Tổng Token / Chi phí AI ước tính & Cách tiết kiệm

| Phase | Ước tính Token (input + output) | Chi phí ước tính (tương đương) | Chiến lược tiết kiệm chính |
|---|---:|---:|---|
| Phase 1 | ~60k tokens | Thấp | Đọc song song 6 file `.md` trong 1 lượt; 0 framework test ngoài (dùng `node:test`). |
| Phase 2 | ~75k tokens | Trung bình-thấp | Dừng nghiệm thu Headless sau Bước 3 trước khi viết 3D/UI; gom nhiều file vào 1 lượt tool call. |
| Phase 3 | ~55k tokens | Thấp | Dùng `edit_file` cục bộ vào các đoạn thay đổi thay vì ghi đè toàn bộ file lớn. |
| Phase 4 | ~70k tokens | Trung bình-thấp | Tái sử dụng `scene.js` (nâng cấp `InstancedMesh` dùng chung cho cả game & bench), viết server `src/run.js` thuần `node:http` (0 dependency mới). |
| **Tổng cộng** | **~260k tokens** | **Gọn & hiệu quả** | **Ngữ cảnh gọn (`AGENTS.md`), lập kế hoạch rõ, kiểm chứng sớm, không chạy agent vòng lặp vô ích.** |

---

## 6. Nếu làm lại từ đầu, sẽ thay đổi gì?

1. **Dùng `InstancedMesh` và zero-allocation hot loop ngay từ Phase 1–2:** Thay vì nâng cấp ở Phase 4, áp dụng mẫu `InstancedMesh` + scratch objects ngay từ đầu sẽ tránh phải viết lại phần quản lý mesh Bóng Mực/đom đóm và đảm bảo hiệu năng cao xuyên suốt 4 phase.
2. **Thiết kế hệ thống keybind và cỡ chữ tiếp cận (`≥ 18 px`) ngay khi dựng HUD ở Phase 2:** Việc phải nới lại cỡ chữ từ `12–14 px` lên `18 px` ở Phase 4 mất công điều chỉnh layout HUD; nếu chọn chuẩn `18 px` ngay từ đầu sẽ tiết kiệm thời gian hơn.
3. **Thêm kịch bản test CLI cho `--export-leaderboard` và `soak` tự động ngay trong `npm test`:** Giúp phát hiện sớm mọi thay đổi ngoài ý muốn ở công cụ phụ trợ trước khi đóng gói.
