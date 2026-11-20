# ADR-001: Mô hình Nhiên liệu Đèn (Integer `1/60` Units) và Luật Thắng `dawn_survived`

- **Trạng thái:** Accepted (Phase 3 — Ticket-03, Contract v1.2)
- **Ngày:** 2026-11-20
- **Bối cảnh:** Sau playtest Phase 2, người chơi thắp hết 5–7 đèn sớm khiến màn chơi kết thúc nhanh và thiếu cao trào ở cuối Đêm. Ticket-03 yêu cầu chuyển mục tiêu sang "giữ đảo sáng tới bình minh", bổ sung nhiên liệu đèn suy giảm theo thời gian, Bóng Mực hút dầu đèn yếu (`fuel < 30`), sức chứa tăng dần và công thức điểm mới.

---

## 1. Quyết định về Mô hình Trạng thái Đèn

### Mô hình cũ (Phase 1–2)
Mỗi đèn chỉ gồm `{ id, pos, lit, deposited }`. Khi `lit = true`, đèn sáng vĩnh viễn và tạo vùng an toàn `6 m` bất biến cho tới hết Đêm.

### Mô hình mới (Phase 3 — Contract v1.2)
Mở rộng trạng thái nội bộ mỗi đèn thành:
```js
{
  id,
  pos,
  lit,           // boolean: đang sáng hay tắt
  deposited,     // int: số đom đóm đã nạp khi đang tắt (reset 0 khi tắt)
  fuelUnits,     // int: đơn vị nguyên 1/60 (0..6000 tương ứng 0..100.0 fuel)
  everLit,       // boolean: đã từng được thắp chưa (để tính relight_cost = 5 & điểm +40)
  relitCount,    // int: số lần đã thắp lại trong Đêm
}
```

### Lý do chọn đơn vị nguyên `1/60` (`fuelUnits`)
- Nếu dùng số thực `fuel -= 1 / 60` qua `18.000` tick (300 giây), sai số IEEE-754 có thể làm ngưỡng `fuel === 30` biến thành `29.999999999999996`, làm sai lệch thời điểm mất vùng an toàn (`fuel < 30`), sai `Math.ceil((100 - fuel) / 10)` khi châm dầu và sai `Math.floor(fuel)` khi tính điểm bình minh.
- Lưu `fuelUnits` bằng số nguyên (`6000` = `100`, `1800` = `30`, tự hao `1`/tick, Bóng Mực `drain` trừ `5`/tick, 1 đom đóm châm thêm `600` đơn vị) đảm bảo **tính tất định tuyệt đối 100%** và loại bỏ hoàn toàn sai số dấu phẩy động. Chỉ chuyển đổi `Math.round((fuelUnits / 60) * 10) / 10` khi xuất JSONL.

---

## 2. Quyết định về Vùng an toàn động & Trạng thái `drain` của Bóng Mực

- **Vùng an toàn động:** Một đèn chỉ chặn Bóng Mực trong `6 m` khi `lit && fuelUnits >= 1800` (`fuel >= 30`). Khi `fuelUnits < 1800`, vùng an toàn tự biến mất để Bóng Mực ở trạng thái `wander` tiến vào cách đèn `<= 2 m` và chuyển sang `drain`.
- **Đồng bộ thứ tự tick:** Trừ nhiên liệu (tự hao + tổng `drain`) thực hiện trong **Bước 2**, và kiểm tra `fuelUnits <= 0` để tắt đèn (`lantern_out`) diễn ra **ngay sau Bước 2** (trước khi Mây tương tác ở Bước 5 và trước khi xét thắng/thua ở Bước 11).
- **Khôi phục vùng an toàn khi châm dầu:** Ở Bước 5, nếu thao tác `refuel` đưa đèn từ `fuelUnits < 1800` lên `>= 1800`, mọi Bóng Mực đang trong vùng `6 m` được đánh dấu `safePushTicks = 30` (đẩy ra mép `6 m` không gây sát thương) và thoát khỏi `drain` về `wander`, thống nhất hoàn toàn với hành vi khi vừa thắp đèn.

---

## 3. Quyết định về Luật thắng `dawn_survived` & Tác động Test cũ

- Loại bỏ hoàn toàn nhánh thắng sớm `all_lit` trong Bước 11.
- Ưu tiên kết thúc ở Bước 11:
  1. `player.flames <= 0` $\rightarrow$ thua ngay `no_flames` (kể cả đúng tick bình minh).
  2. `timeLeftTicks <= 0` (bình minh) $\rightarrow$ đếm số đèn `lit`: nếu `>= Math.ceil(0.6 * lanterns.length)` (`3/5`, `4/6`, `5/7`) thì thắng `dawn_survived` và cộng điểm bình minh `+(50 + Math.floor(fuelUnits / 60))` mỗi đèn sáng + `50 * flames`; ngược lại thua `dawn`.
- **Hệ quả & Xử lý hồi quy:** Các unit test và scenario Phase 1–2 kiểm tra thắng ngay `all_lit`, thưởng thời gian `per_second_left`, hoặc thời lượng Đêm cũ (`300/330/360 s`) không còn hợp lệ theo luật mới $\rightarrow$ được **cập nhật tường minh** sang kiểm chứng luật v1.2 (ghi rõ trong `CHANGELOG.md` và `docs/phase3-report.md`), tuyệt đối không `.skip()` âm thầm.
