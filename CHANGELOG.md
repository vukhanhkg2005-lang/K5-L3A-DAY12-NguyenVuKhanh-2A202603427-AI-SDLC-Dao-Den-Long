# Changelog — Đảo Đèn Lồng

## [Phase 3] — Ticket-03 "Đèn cạn dầu" (Contract v1.2)

### Breaking Changes (Thay đổi phá vỡ tương thích so với Contract v1.1)
1. **Contract version:** Nâng cấp `game.contract.json` từ `"1.1"` lên `"1.2"`.
2. **Thời lượng Đêm rút ngắn:**
   - `night1_duration_s`: `300` $\rightarrow$ `240`
   - `night2_duration_s`: `330` $\rightarrow$ `270`
   - `night3_duration_s`: `360` $\rightarrow$ `300`
3. **Luật thắng thay đổi (`[THAY THẾ]` `all_lit`):**
   - Loại bỏ hoàn toàn lý do kết thúc `"all_lit"` (thắp đủ đèn không còn thắng sớm).
   - Thắng mới: sống sót đến bình minh (`time_left_s == 0`) với số đèn đang sáng `>= ceil(0.6 * tổng đèn)` (Đêm 1: `3/5`, Đêm 2: `4/6`, Đêm 3: `5/7`) $\rightarrow$ `game_over.reason = "dawn_survived"`. Dưới ngưỡng $\rightarrow$ `"dawn"`. Hết Ngọn Lửa luôn thua `"no_flames"` trước (kể cả đúng tick cuối).
4. **Nhiên liệu đèn & Tương tác châm dầu (`[THAY THẾ]` đèn sáng vĩnh viễn):**
   - Đèn sáng có nhiên liệu `fuel = 100` (tính bằng đơn vị nguyên `1/60`), tự hao `1.0/s`. Hết dầu (`<= 0`) đèn tắt (`deposited = 0`, `ever_lit = true`, phát `lantern_out`).
   - Đèn đã từng sáng (`ever_lit`) chỉ tốn `relight_cost = 5` đom đóm để thắp lại.
   - Đèn đang sáng chưa đầy dầu nhận thao tác châm dầu (`refuel`, `10` fuel/đom đóm); đèn đầy dầu không được chọn khi tương tác.
5. **Vùng an toàn động & Bóng Mực hút dầu (`[THAY THẾ]` vùng an toàn cố định):**
   - Đèn sáng có `fuel < 30` mất vùng an toàn `6 m` (đúng `30` vẫn còn).
   - Bóng Mực có thêm trạng thái chuẩn thứ 6: `"drain"` (hút `5 fuel/s` khi áp sát đèn yếu `<= 2 m`, phát `fuel_drain` mỗi 60 tick).
   - Bóng Mực hết `stunned` quay về `wander`.
6. **Công thức điểm thay đổi hoàn toàn (`[THAY THẾ]`):**
   - Nạp/châm dầu: `+10` $\rightarrow$ `+5` mỗi đom đóm.
   - Thắp lần đầu: `+100`; Thắp lại (`ever_lit`): `+40`.
   - Pulse trúng Bóng Mực: `+5` mỗi con; tổng `+15` nếu ngay trước đó nó đang ở trạng thái `drain`.
   - Bình minh (chỉ khi thắng `dawn_survived`): mỗi đèn đang sáng `+(50 + floor(fuel))`, mỗi Ngọn Lửa còn lại `+50`. **Bỏ thưởng thời gian (`per_second_left = 0`).**
7. **Schema JSONL v1.2:**
   - Snapshot `lanterns[]` thêm `fuel`, `ever_lit`, `relit_count`; `player` thêm `capacity`.
   - Event `lantern_lit` thêm `relight: boolean`; thêm các event `refuel`, `lantern_out`, `fuel_drain`.

### Added
- **Sức chứa động:** `capacity = min(20, 10 + 2 * successful_lights)` (reset `0` mỗi Đêm).
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Lưu trong `localStorage`; đổi viền/mắt Bóng Mực sang `#00B3FF`, đổi màu cảnh báo UI sang `#FFFFFF` kèm biểu tượng `⚠`.
- **Phân biệt đèn không cần màu:** Đèn tắt xẹp 20% (`scale.y = 0.8`) kèm họa tiết vết rách trên giấy đèn; đèn sáng có thanh dầu 3D phía trên và nhấp nháy chậm `1 Hz` khi `fuel < 30`.
- **ADR-001:** Ghi nhận quyết định kiến trúc tại `docs/adr/001-lantern-fuel-and-dawn-win.md`.

### Updated Tests (Không bỏ qua âm thầm)
- Cập nhật test `deposit/lantern_lit/win` và scenario `s1_win_all_lit` $\rightarrow$ kiểm chứng thắp đèn không thắng sớm, thắng `dawn_survived` kèm công thức điểm bình minh v1.2.
- Cập nhật test `dawn timeout vs all_lit priority` $\rightarrow$ kiểm chứng ưu tiên `no_flames` > `dawn_survived` > `dawn` đúng tick bình minh.
- Cập nhật kịch bản benchmark Đêm 3 đầy đủ sang thời lượng mới `300 s` (`18.000` tick).

---

## [Phase 2] — Ticket-02 "Ba hòn đảo" (Contract v1.1)
- Chuẩn hóa toàn bộ thông số vật lý & thứ tự 12 bước/tick.
- Thêm Đêm 2 (Đảo Cau) và Đêm 3 (Đảo Chuông), Lướt (`dash`), Rơi khỏi đảo, Bục nhảy, Gió Lạc, Bùa Gió, Gió mạnh, Tạm dừng, Cài đặt, HUD đầy đủ và 10 SFX + nhạc nền.

## [Phase 1] — PRD-0 "Đảo Đèn Lồng" (Contract v1.0)
- Xây dựng bản chơi được Đêm 1 – Đảo Bến với kiến trúc tách biệt `src/sim/` và `src/render/`, chế độ headless CLI và bộ kiểm chứng ban đầu.
