# Đảo Đèn Lồng — Day 12 AI SDLC Lab

> **Sinh viên:** Nguyễn Vũ Khánh (`2A202603427`) · **Lớp:** K5-L3A  
> **Trạng thái hiện tại:** Hoàn thành **Phase 1 (PRD-0 + Test Contract v1.0)** — Tag `phase-1`  
> *(Link video demo sẽ được cập nhật ở đầu README vào Phase 4 / Release `v1.0.0`)*

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba lấy bối cảnh Đêm 1 – Đảo Bến. Người chơi điều khiển **Mây** (người giữ đèn nhỏ tuổi đội nón lá treo đèn lồng) thu thập đom đóm vàng cam để thắp sáng **5 Đèn Lồng Lớn** trước bình minh, né **Bóng Mực** trong sương đêm và dùng **Tỏa sáng (Pulse)** để xua đuổi chúng.

---

## 1. Cài đặt & Chạy game (tối đa 3 lệnh)

Yêu cầu: **Node.js >= 18** (chạy đồng nhất trên macOS, Linux và Windows).

```bash
npm ci
npm run build
npm start
```

Mở trình duyệt tại `http://localhost:4173` để chơi ngay.

---

## 2. Điều khiển trong game

| Phím / Thao tác | Chức năng |
|---|---|
| `W A S D` hoặc phím mũi tên | Di chuyển Mây theo hướng camera 3D |
| `Space` | Nhảy |
| `E` (hoặc `F`) | Nạp đom đóm / Thắp Đèn Lồng Lớn khi đứng trong vùng đèn |
| `Shift` (hoặc `Q`) | **Tỏa sáng (Pulse)** — tốn 2 đom đóm, đẩy lùi và làm choáng Bóng Mực xung quanh |
| `Kéo chuột` hoặc `J` / `L` | Xoay camera 3D quanh Mây |
| `M` | Bật / tắt âm thanh tổng hợp (Web Audio API) |
| `R` | Chơi lại nhanh |

---

## 3. Cách tính điểm & Luật chơi (khớp `game.contract.json`)

Tất cả hằng số gameplay trong `src/sim/` được đọc trực tiếp từ [game.contract.json](game.contract.json):

- **Nhặt đom đóm:** `+10` điểm/đom đóm (`carry_capacity = 8`, `pickup_radius = 1.6 m`).
- **Thắp sáng Đèn Lồng Lớn:** `+100` điểm/đèn (`lantern_cost = 4`, `interact_radius = 2.5 m`). Đèn đã sáng tạo vùng an toàn `safe_radius = 7.0 m` khiến Bóng Mực không thể tiến vào.
- **Tỏa sáng (Pulse):** Tốn `2` đom đóm, hồi chiêu `4.0 s`, đẩy lùi `6.0 m` và làm choáng `3.0 s` các Bóng Mực trong `7.0 m`, thưởng `+25` điểm/Bóng Mực bị choáng.
- **Bóng Mực chạm Mây:** Mất `1` ngọn lửa (tối đa `3`), đánh rơi `round(carried * 0.5)` đom đóm và kích hoạt bất tử `2.0 s`.
- **Thắng (`all_lit`):** Thắp đủ `5/5` Đèn Lồng Lớn $\rightarrow$ cộng thưởng `floor(time_left_s) * 2 + flames_left * 50`.
- **Thua:** Hết ngọn lửa (`no_flames`) hoặc hết `300 s` Đêm 1 (`dawn`).
- **Rơi khỏi đảo:** Tắt (`fall_enabled: false`) — nhân vật được giới hạn trong biên hòn đảo tròn.

---

## 4. Chế độ Headless (Test Contract v1.0) & Kiểm thử

### Chạy toàn bộ bộ kiểm thử (Unit Test + Headless Scenarios + Determinism)
```bash
npm test
```

### Chạy trực tiếp CLI Headless theo Test Contract v1.0
```bash
node src/headless.js --seed 2026 --night 1 \
  --scenario tests/scenarios/s1_win_all_lit.scenario.json \
  --inputs tests/scenarios/s1_win_all_lit.inputs.json \
  --ticks 300 --out out.jsonl --snapshot-every 10
```

- Logic chạy cố định `60 tick/giây`, không cần GPU hay trình duyệt, tất định 100% (Mulberry32 seeded PRNG).
- Định dạng `inputs` hoặc `scenario` không hợp lệ trả mã thoát `2` kèm thông báo ra `stderr`.

---

## 5. Sáng tạo của tôi (Tách biệt hoàn toàn khỏi Headless)

Các chi tiết sáng tạo dưới đây nằm 100% trong `src/render/` và **không được nạp ở chế độ headless**, đảm bảo không làm sai lệch bất kỳ dòng output nào của Test Contract:

1. **Biển mây trôi & Bầu trời sao cổ tích (`src/render/scene.js`):** Hòn đảo tròn nổi trên vòng mây trôi chậm dưới mực `Y = 0`; ánh sáng toàn đảo, sương mù và màu bầu trời chuyển ấm dần theo tỉ lệ đèn đã thắp (`0/5` $\rightarrow$ `5/5`).
2. **Đèn lồng mini lắc lư trên nón lá & Đom đóm nhịp thở:** Chiếc đèn nhỏ treo trước vành nón lá của Mây đung đưa và sáng rực dần theo số đom đóm đang mang; các đốm sáng xung quanh đèn hiển thị trực quan số đom đóm đã nạp.
3. **Âm thanh cổ tích tổng hợp không cần file mẫu (`src/render/audio.js`):** Dùng Web Audio API tạo giai điệu ngũ âm khi nhặt đom đóm, hợp âm ấm khi thắp đèn và sóng âm khi dùng Pulse (có thể bật/tắt bằng phím `M`).

---

## 6. Cấu trúc dự án & Tài liệu SDLC

```text
game.contract.json          # Test Contract v1.0 (nguồn hằng số duy nhất)
AGENTS.md                   # Harness AI: quy tắc dự án & bất biến Contract
.claude/                    # Skill verify-phase & hooks tự kiểm chứng
.github/workflows/ci.yml    # CI tự động build & test mỗi lần push
src/
  sim/                      # Core simulation thuần JS (60Hz, Mulberry32 PRNG)
  headless.js               # CLI headless tuân thủ Test Contract v1.0
  render/                   # Renderer 3D Three.js & Web Audio procedural
  main.js                   # Điểm vào web app + HUD + vòng lặp fixed-timestep
tests/
  sim.test.js               # Unit test logic cốt lõi
  scenarios/                # Kịch bản JSON + inputs cho Test Contract
  run-scenarios.js          # Bộ kiểm thử CLI headless + tính tất định + mã lỗi 2
docs/
  notes/                    # Giả định Phase 1, nhật ký AI/token, đánh giá Phase 1
  proof/phase-1/            # Bằng chứng thật (JSONL, SHA-256, test_output, REPORT.md)
CREDITS.md · LICENSE        # Bản quyền & ghi nguồn asset (100% procedural + MIT libs)
```

### Tài liệu tham khảo của Lab
- [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md)
- Báo cáo bằng chứng Phase 1: [docs/proof/phase-1/REPORT.md](docs/proof/phase-1/REPORT.md)
- Giả định & tiêu chí nghiệm thu: [docs/notes/phase-1-assumptions.md](docs/notes/phase-1-assumptions.md)
- Nhật ký dùng AI & token: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Đánh giá Phase 1: [docs/notes/phase-1-eval.md](docs/notes/phase-1-eval.md)
