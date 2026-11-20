# Phase 2 Specification & Acceptance Criteria (Ticket-02 "Ba hòn đảo" · Contract v1.1)

## 1. Thay đổi so với Phase 1 (Migration & Regression Notes)
Ticket-02 chuẩn hóa lại các hằng số và một số luật đã giả định ở Phase 1. Các thay đổi sau được cập nhật kèm lý do rõ ràng (cả trong simulation lẫn test cũ bị ảnh hưởng):

| Hạng mục | Phase 1 (giả định cũ) | Phase 2 (chuẩn Ticket-02 v1.1) | Lý do & Ảnh hưởng test cũ |
|---|---|---|---|
| Điểm `per_mote` | Cộng `+10` khi nhặt (`mote_picked`) | Cộng `+10` khi **nạp** (`deposit`) | Chuẩn hóa chống farm điểm không nạp đèn. Test `sim.test.js` & `s1_win` cập nhật kỳ vọng điểm theo lúc nạp. |
| `fall_enabled` | `false` (chặn tại biên đảo) | `true` (rơi khi `Y < -10`, mất 1 lửa + hết đom đóm, chờ 60 tick hồi sinh + 90 tick bất tử) | Cần cho Đảo Cau (cầu tre/bục nhảy) và biên đảo. Bổ sung unit test & scenario rơi đảo. |
| Hằng số `tuning` | `carry=8`, `lantern_cost=4`, `pickup=1.6`, `interact=2.5`, `pulse_cost=2`, `pulse_r=7`, `pulse_stun=3s`, `pulse_push=6m`, `safe_r=7`, `per_stun=25` | `carry=10`, `lantern_cost=10`, `pickup=1.0`, `interact=2.0`, `pulse_cost=3`, `pulse_r=5.0` (3D), `pulse_stun=2.0s`, `pulse_push=4.0m` (15 tick), `safe_r=6.0`, `per_stun=5` | Đồng bộ cảm giác chơi toàn lớp. Scenario Phase 1 cập nhật số liệu input/vị trí tương ứng chuẩn mới. |
| Đom đóm rơi khi bị đánh | Tan vào sương | `floor(carried/2)` rơi ra vành `1.5–2.5 m`, `kind="dropped"`, TTL `480` tick, nhặt lại từ tick sau | Đúng cơ chế nhặt lại đom đóm rơi của Ticket-02. |
| Trạng thái Bóng Mực | `chase`, `stunned` | Đúng 5 tên: `spawning`, `wander`, `chase`, `recoil`, `stunned` | Chuẩn hóa máy trạng thái (phát hiện 12 m / bỏ đuổi 18 m, recoil 2 m / 60 tick). |

### Giả định bổ sung cho điểm chưa ghi tường minh ở Ticket-02
- **Điểm xuất phát Đêm 3 (Đảo Chuông):** Tâm `(0,0,0)` nằm dưới Tầng 2 (`Y=6`, bán kính `8 m`) và Tháp chuông (`r=2 m`). Vì vậy khi không có `scenario.player.pos`, Mây xuất phát trên Tầng 0 ở `(0, 0, -14)` (ngoài Tầng 2 và Tầng 1, quay mặt `+Z` hướng về cầu thang/đảo). Đêm 1 và Đêm 2 xuất phát tại `(0, 0, 0)` hướng `+Z`.
- **Chu kỳ Gió mạnh Đêm 3:** Cơn gió đầu tiên kích hoạt tại `sim_tick = 1800` (giây 30), kéo dài `300` tick (`5 s`), lặp lại mỗi `1800` tick (`30 s`); cảnh báo trước `120` tick (`2 s`) trước mỗi cơn gió bằng hướng gió định sẵn (`wind_warning` nội bộ cho renderer, còn trong snapshot `wind.active` chỉ `true` trong `300` tick cơn gió đang thổi).

---

## 2. Acceptance Criteria (AC) kiểm chứng được cho Phần 3 & Contract v1.1

### AC-P2-1: Vật lý chuẩn & Lướt (`dash`)
- **AC-1.1:** Chạy tốc độ `6.0 m/s` (nhảy `vy = 7.0 m/s`, `g = -20 m/s²`, chỉ nhảy khi `grounded == true`).
- **AC-1.2:** Bấm `dash` (rising edge) phát `dash {}`, di chuyển `14.0 m/s` trong `12` tick (`0.2 s`), hồi chiêu `90` tick (`1.5 s`) tính từ lúc bắt đầu lướt. Đứng yên sẽ lướt theo hướng quay mặt; đang trên không giữ nguyên `Y` (`vy = 0`). Không bất tử khi lướt.

### AC-P2-2: Rơi khỏi đảo (`Y < -10`)
- **AC-2.1:** Đi ra ngoài đảo (Đêm 1 `r > 40 m`, Đêm 2 ngoài đảo A/B & cầu tre, Đêm 3 `r > 45 m`) rơi xuống dưới `Y < -10`: kích hoạt đúng 1 lần (bỏ qua bất tử), phát `player_hit {by:"fall", flames, dropped:0, lost}`, mất toàn bộ đom đóm đang mang.
- **AC-2.2:** Nếu còn Ngọn Lửa, chờ `60` tick (không nhặt, không bị chạm) rồi hồi sinh tại điểm xuất phát với `vel = [0,0,0]`, `invuln_ticks = 90`. Nếu hết Ngọn Lửa (`flames == 0`) thua ngay (`game_over lost no_flames`) không hồi sinh.

### AC-P2-3: 3 Bản đồ chuẩn, Bục nhảy, Dốc, Tầng & Gió mạnh
- **AC-3.1 (Đêm 1 – Đảo Bến):** Đảo R=40 m, 5 đèn `L1..L5` đúng tọa độ, 24 điểm sinh đom đóm, 12 điểm sinh Bóng Mực (2 con tick 300, mỗi 480 tick, tối đa 6).
- **AC-3.2 (Đêm 2 – Đảo Cau):** 2 đảo R=28 m tại `(0,0,0)` & `(70,0,0)`, cầu tre `x∈[26,44], z∈[-2,2]`, 6 đèn `L1..L6`, 2 bục nhảy `(20,0,18)` và `(50,0,-18)` phóng `vy=14, vh=24` sang đảo kia (khóa hướng phóng tới khi chạm đất, vẫn cho lướt).
- **AC-3.3 (Đêm 3 – Đảo Chuông):** Đảo R=45 m 3 tầng (`Y=0`, `Y=3` vành 12–24 m `z>0`, `Y=6` đĩa R=8 m), vách đứng không leo được, 2 dốc rộng 3 m tại góc `30°` & `150°` (R=30 $\rightarrow$ R=24), bục nhảy `(0,3,13)` (`vy=12, vh=8` hướng `-Z`) đáp lên Tầng 2, tháp chuông R=2 m cao 8 m chặn di chuyển, 7 đèn `L1..L7`, Bóng Mực tốc độ `4.5 m/s` (mỗi 360 tick, tối đa 10).
- **AC-3.4 (Gió mạnh Đêm 3):** Khi `wind_enabled = true`, mỗi 30 s thổi 5 s (`wind.active == true`), đẩy Mây `2.0 m/s` theo `wind.dir_deg`; báo trước 2 s trên GUI (lá bay + âm thanh).

### AC-P2-4: Gió Lạc (Drifters — Đêm 2 & 3)
- **AC-4.1:** Tối đa 2 con (`D1, D2...`), sinh tại tick `1200, 2400...`. Chuyển `idle (2 m/s)` $\leftrightarrow$ `chase (7 m/s)` khi `carried >= 5` và `distXZ <= 15 m`.
- **AC-4.2:** Chạm (`XZ <= 1.2 m`) cướp `min(3, carried)`, phát `drifter_steal {drifter_id, amount, carried}`, chuyển `flee` (`7 m/s` rời xa Mây trong `240` tick rồi `removed`). Bỏ qua `safe_radius` và `invuln`, không trừ Ngọn Lửa, mỗi con chỉ cướp 1 lần.
- **AC-4.3:** Trúng Pulse khi `chase` $\rightarrow$ `flee` không cướp. Trúng Pulse khi `flee` có đồ $\rightarrow$ thả toàn bộ đom đóm đã cướp thành `kind: "dropped"`, phát `drifter_drop {drifter_id, amount}`, `removed` sau `120` tick.

### AC-P2-5: Bùa Gió (Charms — Đêm 2 & 3)
- **AC-5.1:** `C1` ở `(35,0,0)` (Đêm 2); `C1 (30,0,25)` & `C2 (-30,0,25)` (Đêm 3). Nhặt theo luật đom đóm, phát `charm_picked {charm_id, charm_ticks: 600}`.
- **AC-5.2:** Trong `600` tick: tốc độ chạy `7.2 m/s`, Lướt không hồi chiêu (vẫn cần rising edge, bỏ qua khi đang lướt). Bùa hồi sinh sau `2700` tick.

### AC-P2-6: Tạm dừng (Pause) & Thứ tự 12 bước
- **AC-6.1:** Bấm `pause` (rising edge) phát `paused {}`, `state` thành `"paused"`. Trong lúc tạm dừng, `tick` vẫn tăng nhưng `sim_tick`, thời gian, hồi chiêu, spawn, TTL đều đứng yên. Bấm `pause` lần nữa phát `resumed {}` và chạy tiếp.
- **AC-6.2:** Đúng thứ tự 12 bước: Gió Lạc cướp trước Bóng Mực hit; thực thể sinh ở bước 10 chỉ tương tác từ tick sau; ưu tiên thắng/thua `no_flames` > `all_lit` > `dawn`.

### AC-P2-7: Hiệu năng Headless & Tính tất định
- **AC-7.1:** Cùng `--seed`, `--night` (1, 2, 3), scenario và inputs cho output JSONL giống hệt nhau từng byte giữa 2 lần chạy.
- **AC-7.2:** Chạy đủ 1 Đêm 3 đầy đủ (`--night 3 --ticks 21600`) hoàn thành trong `<= 30 s`.

### AC-P2-8: Giao diện 3D, Bảng màu chuẩn, Chuỗi 3 Đêm, Cài đặt, HUD & Âm thanh (Bước 4)
- **AC-8.1 (Chuỗi 3 Đêm & Menu):** Menu chính $\rightarrow$ Giới thiệu Đêm (tên đảo + lời Ông Đăng) $\rightarrow$ Chơi $\rightarrow$ Kết quả $\rightarrow$ Đêm tiếp theo $\rightarrow$ Màn hình Bình Minh với tổng điểm 3 Đêm; thua cho chơi lại Đêm đó.
- **AC-8.2 (Menu Tạm dừng & Cài đặt):** `Esc`/`P` mở menu (Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu). Cài đặt âm lượng & độ nhạy chuột lưu vào `localStorage` giữa các phiên.
- **AC-8.3 (HUD đầy đủ):** Ngọn Lửa (trên trái), đồng hồ `mm:ss` (trên giữa, đỏ + nhấp nháy khi `<= 30 s`), đèn `k/n` & điểm (trên phải), thanh đom đóm 10 ô (dưới giữa), icon hồi chiêu Lướt & Tỏa Sáng (dưới phải), gợi ý `"E — Nạp ánh sáng (x/10)"` khi gần đèn, mũi tên chỉ đèn chưa sáng gần nhất khi ngoài khung hình.
- **AC-8.4 (Âm thanh Web Audio API):** Nhạc nền đêm + đủ 10 SFX (nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối) + tiếng báo gió mạnh.
- **AC-8.5 (Bảng màu chuẩn & Ánh sáng & FPS):** Đúng mã Hex chuẩn (sai lệch `<= 10%` mỗi kênh RGB), cường độ ánh sáng môi trường `0.15 + 0.55 * (lit / total)`, bản 3D đạt `>= 30 FPS` trung bình ở `1280×720`.
