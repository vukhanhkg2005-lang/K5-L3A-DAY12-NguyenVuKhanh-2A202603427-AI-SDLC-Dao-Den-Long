# Đảo Đèn Lồng — Day 12 AI SDLC Lab

> **Sinh viên:** Nguyễn Vũ Khánh (`2A202603427`) · **Lớp:** K5-L3A  
> **Trạng thái hiện tại:** Hoàn thành **Phase 3 (Ticket-03 Change Request "Đèn cạn dầu" · Test Contract v1.2)** — Tag `phase-3`  
> *(Link video demo sẽ được cập nhật ở đầu README vào Phase 4 / Release `v1.0.0`)*

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba trải qua chuỗi **3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông)**. Người chơi điều khiển **Mây** (đội nón lá treo đèn lồng) thu thập đom đóm, thắp sáng và **châm dầu giữ đảo sáng cho tới bình minh**, đồng thời đối phó **Bóng Mực** hút dầu đèn yếu, **Gió Lạc** và **Gió mạnh**.

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

## 2. Điều khiển & Cài đặt

| Phím / Thao tác | Chức năng |
|---|---|
| `W A S D` hoặc phím mũi tên | Di chuyển Mây (`6.0 m/s`, có Bùa Gió: `7.2 m/s`) |
| `Space` | Nhảy (`vy = 7.0 m/s`, chỉ nhảy khi chạm đất) |
| `Shift` | **Lướt (Dash)** — `14 m/s` trong `0.2 s`, hồi chiêu `1.5 s` (giữ độ cao trên không) |
| `E` | Nạp ánh sáng / Thắp lại đèn (`5` đom đóm) / **Châm dầu** (`+10` fuel/đom đóm) |
| `Q` hoặc `F` | **Tỏa Sáng (Pulse)** — tốn `3` đom đóm, hồi chiêu `3.0 s`, đẩy lùi `4 m` & làm choáng Bóng Mực `2.0 s` |
| `Kéo chuột` hoặc `J` / `L` | Xoay camera 3D (độ nhạy chỉnh trong Cài đặt) |
| `Esc` hoặc `P` | **Tạm dừng** (Tiếp tục / Chơi lại Đêm / Cài đặt / Về Menu) |
| `M` | Tắt / Bật âm thanh nhanh |

- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Bật/tắt trong menu **Cài đặt** (lưu `localStorage`). Khi bật, viền/mắt Bóng Mực đổi `#7A3CFF` → `#00B3FF`, màu cảnh báo UI đổi `#FF5A5F` → `#FFFFFF` kèm biểu tượng `⚠`. Mọi lúc đèn tắt đều **xẹp 20%** và có **vết rách giấy**, đèn sắp cạn dầu (`< 30`) nhấp nháy `1 Hz`.

---

## 3. Luật chơi mới (Phase 3 — Contract v1.2 "Đèn cạn dầu")

Mọi hằng số đọc trực tiếp từ [game.contract.json](game.contract.json) (`contract_version: "1.2"`):

- **Mục tiêu mới (giữ đảo sáng tới bình minh):** Không còn thắng sớm khi thắp đủ đèn. Sống sót tới hết giờ với số đèn đang sáng `≥ ceil(0.6 × tổng đèn)` (**Đêm 1:** `≥ 3/5` trong `240 s` · **Đêm 2:** `≥ 4/6` trong `270 s` · **Đêm 3:** `≥ 5/7` trong `300 s`) → **Thắng (`dawn_survived`)**; dưới ngưỡng → thua (`dawn`); hết Ngọn Lửa → thua ngay (`no_flames`).
- **Nhiên liệu đèn (tính theo đơn vị nguyên `1/60`):** Đèn vừa thắp có `fuel = 100`, tự hao `1.0/giây`. Khi `fuel < 30`, đèn mất vùng an toàn `6 m` và Bóng Mực ở trạng thái `wander` sẽ tiến tới `drain` (`5.0/giây`). Hết dầu (`≤ 0`) đèn tắt (`lantern_out`), thắp lại chỉ cần **`5` đom đóm** (`ever_lit = true`). Châm dầu lên `≥ 30` khôi phục vùng an toàn và đẩy Bóng Mực ra mép trong `≤ 30` tick.
- **Sức chứa động:** `capacity = min(20, 10 + 2 × successful_lights)` (reset `0` mỗi Đêm).
- **Công thức điểm v1.2:**
  - `+5` mỗi đom đóm nạp vào đèn (thắp mới, thắp lại hoặc châm dầu)
  - `+100` thắp lần đầu · `+40` thắp lại (`ever_lit`)
  - `+5` mỗi Bóng Mực trúng Pulse (**tổng `+15`** nếu đang `drain`)
  - Bình minh (chỉ khi thắng `dawn_survived`): mỗi đèn đang sáng `+(50 + floor(fuel))` · mỗi Ngọn Lửa còn lại `+50` (bỏ thưởng thời gian).

---

## 4. Chế độ Headless (Test Contract v1.2) & Kiểm thử

```bash
npm test
```

Chạy trực tiếp CLI Headless:
```bash
node src/headless.js --seed 2026 --night 3 --ticks 18000 --out out.jsonl --snapshot-every 10
```

- Đúng 6 trạng thái Bóng Mực chuẩn: `spawning`, `wander`, `chase`, `recoil`, `stunned`, `drain`.
- File `inputs` hoặc `scenario` sai định dạng trả mã thoát `2` kèm thông báo ra `stderr`.

---

## 5. Sáng tạo của tôi (Tách biệt hoàn toàn khỏi Headless)

Toàn bộ phần sáng tạo nằm riêng trong `src/render/`, tắt hoàn toàn ở chế độ headless:
1. **Biển mây trôi & Bầu trời sao cổ tích (`src/render/scene.js`):** Ánh sáng môi trường `0.15 + 0.55 × (lit / total)` tự sáng/tối động khi đèn được thắp hoặc cạn dầu tắt; thanh dầu 3D billboarding phía trên đèn; lá vàng bay báo gió Đảo Chuông.
2. **Phân biệt đèn không cần màu & Chế độ mù màu:** Đèn tắt xẹp 20% kèm họa tiết vết rách giấy procedural, đèn yếu nhấp nháy `1 Hz`, chuyển đổi bảng màu `#00B3FF` / `#FFFFFF + ⚠` tức thì trong Cài đặt.
3. **Âm thanh Web Audio API tổng hợp 100% (`src/render/audio.js`):** Nhạc nền ngũ âm + 10 SFX + âm gió & đèn tắt, không cần file audio ngoài.

---

## 6. Tài liệu SDLC, ADR, Changelog & Bằng chứng

- Test Contract v1.2: [game.contract.json](game.contract.json)
- Quyết định kiến trúc (ADR-001): [docs/adr/001-lantern-fuel-and-dawn-win.md](docs/adr/001-lantern-fuel-and-dawn-win.md)
- Breaking Changes: [CHANGELOG.md](CHANGELOG.md)
- Báo cáo & Bằng chứng Phase 3: [docs/phase3-report.md](docs/phase3-report.md) · [docs/evidence/phase3/](docs/evidence/phase3/)
- Harness AI: [AGENTS.md](AGENTS.md) · [.claude/skills/verify-phase/SKILL.md](.claude/skills/verify-phase/SKILL.md) · [.claude/settings.json](.claude/settings.json) · [.github/workflows/ci.yml](.github/workflows/ci.yml)
- Ghi chép & Lab: [docs/notes/ai-log.md](docs/notes/ai-log.md) · [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md) · [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE)
