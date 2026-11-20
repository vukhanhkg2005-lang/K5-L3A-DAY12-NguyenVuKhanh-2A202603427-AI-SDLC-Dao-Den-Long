# Đảo Đèn Lồng — Day 12 AI SDLC Lab

> **Sinh viên:** Nguyễn Vũ Khánh (`2A202603427`) · **Lớp:** K5-L3A  
> **Trạng thái hiện tại:** Hoàn thành **Phase 2 (Ticket-02 "Ba hòn đảo" · Test Contract v1.1)** — Tag `phase-2`  
> *(Link video demo sẽ được cập nhật ở đầu README vào Phase 4 / Release `v1.0.0`)*

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba trải qua chuỗi **3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông)**. Người chơi điều khiển **Mây** (đội nón lá treo đèn lồng nhỏ) gom đom đóm thắp sáng toàn bộ Đèn Lồng Lớn trước bình minh, né **Bóng Mực**, đối phó **Gió Lạc**, tận dụng **Lướt**, **Tỏa Sáng**, **Bục nhảy** và **Bùa Gió**.

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
| `W A S D` hoặc phím mũi tên | Di chuyển Mây (`6.0 m/s`, có Bùa Gió: `7.2 m/s`) |
| `Space` | Nhảy (`vy = 7.0 m/s`, chỉ nhảy khi chạm đất) |
| `Shift` | **Lướt (Dash)** — `14 m/s` trong `0.2 s`, hồi chiêu `1.5 s` (trên không giữ nguyên độ cao) |
| `E` | Nạp ánh sáng vào Đèn Lồng Lớn gần nhất (`E — Nạp ánh sáng (x/10)`) |
| `Q` hoặc `F` | **Tỏa Sáng (Pulse)** — tốn `3` đom đóm, hồi chiêu `3.0 s`, đẩy lùi `4 m` & làm choáng Bóng Mực `2.0 s` |
| `Kéo chuột` hoặc `J` / `L` | Xoay camera 3D (độ nhạy chỉnh trong Cài đặt) |
| `Esc` hoặc `P` | **Tạm dừng** (mở menu: Tiếp tục / Chơi lại Đêm / Cài đặt / Về Menu) |
| `M` | Tắt / Bật âm thanh nhanh |

---

## 3. Ba Hòn Đảo & Luật chơi chuẩn (Contract v1.1)

Mọi hằng số gameplay trong `src/sim/` đọc trực tiếp từ [game.contract.json](game.contract.json) (`contract_version: "1.1"`):

- **Đêm 1 — Đảo Bến (`300 s`, 5 đèn):** Đảo tròn bán kính `40 m`, rơi khỏi đảo (`Y < -10`) mất 1 Ngọn Lửa & toàn bộ đom đóm, hồi sinh sau `60` tick với `90` tick bất tử.
- **Đêm 2 — Đảo Cau (`330 s`, 6 đèn):** Hai đảo tròn bán kính `28 m` nối bằng cầu tre không lan can, 2 **Bục nhảy** phóng giữa hai đảo, **Bùa Gió `C1`** trên cầu tre (`7.2 m/s` & Lướt không hồi chiêu trong `10 s`), và **Gió Lạc** rình cướp đom đóm khi Mây mang `>= 5`.
- **Đêm 3 — Đảo Chuông (`360 s`, 7 đèn):** Đảo `45 m` gồm 3 tầng có vách đứng, 2 dốc gỗ (`30°`, `150°`), bục nhảy lên tầng 2 cạnh **Tháp chuông**, 2 Bùa Gió `C1/C2`, Bóng Mực nhanh hơn (`4.5 m/s`), và **Gió mạnh** mỗi `30 s` thổi `5 s` (báo trước `2 s`).
- **Điểm số chuẩn:** `+10` mỗi đom đóm nạp vào đèn · `+100` mỗi đèn thắp sáng · `+5` mỗi Bóng Mực trúng Tỏa Sáng · khi thắng cộng `+floor(time_left_s) * 2 + 50 * flames`. Tổng điểm game là tổng các Đêm đã thắng.

---

## 4. Chế độ Headless (Test Contract v1.1) & Kiểm thử

### Chạy toàn bộ bộ kiểm thử (Unit Tests + Regression Phase 1 + Phase 2 Scenarios + Benchmark 21.600 tick)
```bash
npm test
```

### Chạy trực tiếp CLI Headless cho Đêm 1, 2 hoặc 3
```bash
node src/headless.js --seed 2026 --night 3 \
  --ticks 21600 --out out.jsonl --snapshot-every 10
```

- Tuân thủ chính xác thứ tự **12 bước trong 1 tick**, 5 trạng thái Bóng Mực (`spawning`, `wander`, `chase`, `recoil`, `stunned`), hỗ trợ `dash`, `pause`, `drifters`, `charms`, `wind`.
- Thời gian chạy Đêm 3 đầy đủ `21.600` tick thực tế: **~0.33 giây** (đạt yêu cầu `≤ 30 s`).
- File `inputs` hoặc `scenario` sai định dạng trả mã thoát `2` kèm lỗi ra `stderr`.

---

## 5. Sáng tạo của tôi (Tách biệt hoàn toàn khỏi Headless)

Toàn bộ hiệu ứng thị giác và âm thanh nằm trong `src/render/`, **không bao giờ được nạp ở chế độ headless**:

1. **Biển mây trôi & Bầu trời sao (`src/render/scene.js`):** Hòn đảo nổi trên biển mây `#12384A` chuyển động chậm, ánh sáng môi trường tăng theo đúng công thức `0.15 + 0.55 * (lit / total)` và lá vàng bay báo hướng gió mạnh trên Đảo Chuông.
2. **Mây & Chi tiết cổ tích:** Áo kem `#E8E2D0`, khăn đỏ `#C8102E`, nón lá treo đèn lồng mini đung đưa, vòng bùa đỏ khi kích hoạt Bùa Gió, dải lụa xám xanh uốn lượn cho Gió Lạc và mũi tên chỉ hướng đèn chưa sáng ngoài màn hình.
3. **Âm thanh Web Audio API tổng hợp 100% (`src/render/audio.js`):** Nhạc nền ngũ âm đêm nhẹ nhàng + đủ 10 hiệu ứng SFX (nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối) + tiếng gió rít, tùy chỉnh âm lượng & độ nhạy chuột lưu vào `localStorage`.

---

## 6. Cấu trúc dự án & Bằng chứng SDLC

- Test Contract: [game.contract.json](game.contract.json)
- Harness AI: [AGENTS.md](AGENTS.md) · [.claude/skills/verify-phase/SKILL.md](.claude/skills/verify-phase/SKILL.md) · [.claude/settings.json](.claude/settings.json) · [.github/workflows/ci.yml](.github/workflows/ci.yml)
- Spec & Báo cáo Phase 2: [docs/phase2-spec.md](docs/phase2-spec.md) · [docs/phase2-report.md](docs/phase2-report.md) · [docs/evidence/phase2/](docs/evidence/phase2/)
- Ghi chép Phase 1 & Nhật ký AI: [docs/proof/phase-1/REPORT.md](docs/proof/phase-1/REPORT.md) · [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Tài liệu Lab: [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md) · [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE)
