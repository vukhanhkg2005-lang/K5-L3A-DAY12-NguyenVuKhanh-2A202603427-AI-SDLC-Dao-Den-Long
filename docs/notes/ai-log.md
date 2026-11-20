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

---

## Phase 2 (Ticket-02 "Ba hòn đảo" — Contract v1.1)

### 1. Cập nhật Harness AI
- Cập nhật `AGENTS.md` và `.claude/skills/verify-phase/SKILL.md` bổ sung quy tắc 12 bước/tick, 5 trạng thái Bóng Mực chuẩn (`spawning`, `wander`, `chase`, `recoil`, `stunned`), quy tắc regression Phase 1 và ngưỡng benchmark `21.600 tick <= 30 s`.
- Viết `docs/phase2-spec.md` với bảng truy vết thay đổi Phase 1 $\rightarrow$ Phase 2 và Acceptance Criteria trước khi viết code.

### 2. Ước tính Token & Cách tiết kiệm
| Giai đoạn trong Phase 2 | Ước tính Token | Cách tiết kiệm |
|---|---|---|
| Bước 1–2: Cập nhật Harness, Spec, Contract v1.1, 3 Maps, Sim 12 bước | ~28k tokens | Thiết kế dùng bộ đếm tick số nguyên và tách `src/sim/maps.js` riêng gọn gàng. |
| Bước 3: Unit test, Regression P1, 8 Scenarios P2, Determinism 3 Đêm, Benchmark 21.600 tick | ~14k tokens | Dừng kiểm chứng Headless 100% xanh trước khi chạm UI để tránh sửa dây chuyền. |
| Bước 4–5: Nâng cấp Three.js 3 đảo, bảng màu chuẩn, HUD đầy đủ, Audio 10 SFX, Menu/Pause/Settings, Report | ~33k tokens | Ghi song song toàn bộ file UI/render/docs trong từng đợt, không đọc lại file đã biết. |
| **Tổng ước tính Phase 2** | **~75k tokens** | Luồng chia chặng Bước 1–3 $\rightarrow$ Bước 4–5 giảm hẳn rủi ro viết lại. |

### 3. Lỗi AI tự phát hiện & sửa trong Phase 2
1. **Dừng sớm khi `paused` trong `src/headless.js`:** Vòng lặp Phase 1 dùng `state !== 'playing'` sẽ ngắt ngay khi `state === 'paused'` $\rightarrow$ sửa thành `sim.isFinished()` (`won` hoặc `lost`).
2. **Lướt trên không ở tick thứ 12:** Biến `isDashingThisTick` ban đầu tính sau khi giảm `dashTicksLeft -= 1` khiến tick cuối của cú lướt chịu trọng lực $\rightarrow$ tính `isDashingThisTick` trước khi giảm bộ đếm.
3. **Off-by-1 trong unit test kiểm tra 120 tick choáng:** Xác minh lại chu kỳ tick `1..120` đang choáng và tick `121` hết choáng, cập nhật assert kiểm tra cả 2 mốc.
4. **Reset rising-edge phím `pause` trong GUI (`src/main.js`):** Đảm bảo vòng lặp GUI vẫn gửi `pause: false` khi đang tạm dừng (không làm tăng `sim_tick`) để lần bấm `Esc` tiếp theo kích hoạt rising-edge `resumed` chuẩn xác.
5. **Benchmark 21.600 tick dừng sớm do gió & Bóng Mực:** Lần chạy đầu người chơi đứng yên trên Đảo Chuông bị gió thổi và Bóng Mực hạ trước tick 21.600 $\rightarrow$ tạo `p2_bench_21600.scenario.json` (`flames: 300`, bật đủ Shades + Drifters + Wind) để đo đúng đủ **21.600 / 21.600 tick** thật (`0.325 s`).

---

## Phase 3 (Ticket-03 Change Request "Đèn cạn dầu" — Contract v1.2)

### 1. Cập nhật Harness & Tài liệu Kiến trúc
- Cập nhật `AGENTS.md` và `.claude/skills/verify-phase/SKILL.md` theo quy tắc Contract v1.2 (đơn vị nhiên liệu nguyên `1/60`, trạng thái `drain`, luật thắng `dawn_survived`, cấm `.skip()` âm thầm).
- Viết ADR [docs/adr/001-lantern-fuel-and-dawn-win.md](../adr/001-lantern-fuel-and-dawn-win.md) và [CHANGELOG.md](../../CHANGELOG.md) liệt kê đầy đủ Breaking Changes.

### 2. Ước tính Token & Cách tiết kiệm
| Giai đoạn trong Phase 3 | Ước tính Token | Cách tiết kiệm |
|---|---|---|
| Bước 1–2: Harness, ADR-001, CHANGELOG, Contract v1.2 & nâng cấp `simulation.js`/`validators.js` | ~24k tokens | Giữ nguyên cấu trúc 12 bước/tick từ Phase 2, chỉ chèn logic nhiên liệu nguyên `1/60` & trạng thái `drain` sạch sẽ. |
| Bước 3: Cập nhật test cũ + viết 5 scenario mới Phase 3 + chạy kiểm chứng | ~13k tokens | Dùng lại khung `tests/run-scenarios.js` và `node:test`, lưu bằng chứng thực tế tự động bằng cờ `--save-evidence`. |
| Bước 4–5: Thanh dầu 3D, đèn xẹp/rách, chế độ mù màu, HUD động 10–20 ô, README & Report | ~18k tokens | Chỉ `edit_file` vào các khối thay đổi trong `scene.js`, `index.html`, `style.css` thay vì viết lại toàn file. |
| **Tổng ước tính Phase 3** | **~55k tokens** | Thiết kế mô-đun tốt từ Phase 2 giúp hấp thụ Change Request lớn gọn nhẹ và ít token. |

### 3. Lỗi phát hiện & xử lý trong Phase 3
1. **Scenario `p3_shade_drain_pulse` đặt Mây cách Bóng Mực `4.12 m <= 6 m`:** Ở bước 8 tick đầu tiên, Bóng Mực đang `drain` chuyển ngay sang `chase` theo đúng luật `Mây vào trong 6 m`, nên không phát `fuel_drain` ở tick 60. Phát hiện ngay qua lần chạy test thật $\rightarrow$ tách rõ thành 2 scenario `P3-3a` (`wander -> drain` với Mây ở xa, phát `fuel_drain` đều đặn mỗi 60 tick) và `P3-3b` (Pulse ngay tick 0 trúng Bóng đang `drain` cộng `+15` điểm).
2. **Độ chính xác ngưỡng `fuel == 30` vs `< 30`:** Dùng số nguyên `fuelUnits` (đơn vị `1/60`) giúp kiểm chứng chính xác tại `1800` đơn vị (đúng `30.0` vẫn còn vùng an toàn `6 m`) và `1799` đơn vị (mất vùng an toàn), loại bỏ hoàn toàn lỗi làm tròn số thực.

---

## Phase 4 (Ticket-04 "Bình minh: phát hành v1.0.0" — Contract v1.3)

### 1. Cập nhật Harness & Hạ tầng phát hành
- Cập nhật `AGENTS.md`, `.claude/skills/verify-phase/SKILL.md` và `.github/workflows/ci.yml` theo Contract v1.3 (`bench_cmd`, `soak_cmd`, `--export-leaderboard`).
- Tạo `src/bench.js`, `src/soak.js`, `src/run.js`, `src/leaderboard.js`, `src/sim/benchMode.js` và `Dockerfile`.

### 2. Ước tính Token & Cách tiết kiệm
| Giai đoạn trong Phase 4 | Ước tính Token | Cách tiết kiệm |
|---|---|---|
| Bước 1–2: Contract v1.3, `bench.js`, `soak.js`, `run.js`, `leaderboard.js`, `benchMode.js` | ~26k tokens | Không cài thêm bất kỳ thư viện npm nào (dùng thuần Node.js `http`/`child_process` + trình duyệt hệ thống). |
| Tối ưu `InstancedMesh` 3D & Accessibility + Leaderboard UI | ~28k tokens | Nâng cấp dùng chung `scene.js` cho cả game thường lẫn bench (`isBenchMode: true`). |
| Tối ưu zero-allocation cho Soak Test, chạy đo thật (`bench.json`, `soak.json`), Retro & Báo cáo | ~16k tokens | Khử cấp phát trong `step()` & dùng `--expose-gc` đưa tỉ lệ RSS từ `1.312×` xuống `1.058×`. |
| **Tổng ước tính Phase 4** | **~70k tokens** | Tổng toàn dự án 4 phase ~260k tokens. |
