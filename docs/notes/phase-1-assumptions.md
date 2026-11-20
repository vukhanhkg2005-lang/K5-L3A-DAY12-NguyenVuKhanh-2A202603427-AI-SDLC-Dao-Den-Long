# Phase 1 — Yêu cầu, Giả định & Tiêu chí Nghiệm thu (PRD-0)

## 1. Tách biệt yêu cầu bắt buộc và chỗ mơ hồ trong PRD-0

### Bắt buộc chính xác (Test Contract v1.0)
- File `game.contract.json` ở gốc repo khớp 100% hằng số `tuning` mà simulation sử dụng.
- CLI headless: `node src/headless.js --seed <int> --night 1 [--scenario <file>] [--inputs <file>] --ticks <int> --out <file.jsonl> [--snapshot-every <int>]`.
- Fixed 60 tick/s, tọa độ mét, Y hướng lên, mặt đất `Y = 0`, xuất phát `(0, 0, 0)`, đo khoảng cách theo mặt phẳng ngang XZ (`<= r`).
- Snapshot tick 0 lấy sau khi dựng scenario và trước khi áp dụng input; bước `k` (`0..N-1`) ghi sự kiện ở `tick = k + 1`.
- Dựng scenario không phát sự kiện và không cộng điểm.
- Lỗi định dạng `inputs`/`scenario` thoát mã `2` kèm thông báo ra `stderr`.
- Tính tất định 100% (cùng seed, scenario, inputs cho JSONL giống hệt nhau).

### Giả định cho các điểm mở / mơ hồ của PRD-0
| Điểm mơ hồ trong PRD-0 | Giả định đã chọn | Ghi chú trong `game.contract.json` |
|---|---|---|
| Kích thước đảo & rơi khỏi đảo | Đảo tròn bán kính 42 m, `fall_enabled: false` (giới hạn người chơi trong biên đảo để tránh lỗi rơi bất ngờ ở Phase 1). Nếu scenario đặt thực thể xa hơn 42 m, biên hiệu dụng tự mở rộng để không chặn test ẩn. | `fall_enabled: false` |
| Vị trí 5 Đèn Lồng Lớn Đêm 1 | 5 đèn `L1..L5` bố trí đều thành vòng tròn bán kính 22 m quanh tâm `(0, 0, 0)`, bắt đầu từ `L1 = (0, 0, 22)`. | `lantern_count_night1: 5` |
| Chi phí thắp đèn & sức chứa đom đóm | Mây mang tối đa 8 đom đóm, mỗi đèn cần 4 đom đóm (tổng 20 đom đóm cho 5 đèn), tự nhặt trong `1.6 m`, tương tác nạp trong `2.5 m`. | `carry_capacity: 8`, `lantern_cost: 4`, `pickup_radius: 1.6`, `interact_radius: 2.5` |
| Cơ chế Bóng Mực & vùng an toàn | Tốc độ `3.8 m/s` (chậm hơn Mây `6.0 m/s`), chạm trong `1.2 m` trừ 1 ngọn lửa (tối đa 3), rơi `round(carried * 0.5)` đom đóm (tan vào sương, không sinh lại dưới chân để tránh tự nhặt lại ngay tick sau), bất tử `2.0 s`. Không được vào `safe_radius = 7.0 m` quanh đèn đã sáng. | `shade_speed: 3.8`, `shade_hit_radius: 1.2`, `flames: 3`, `hit_drop_ratio: 0.5`, `invuln_s: 2.0`, `safe_radius: 7.0` |
| Cơ chế Tỏa sáng (Pulse) | Tốn 2 đom đóm, hồi chiêu `4.0 s`, bán kính `7.0 m`, đẩy lùi `6.0 m` và làm choáng `3.0 s` (`state: "stunned"`). | `pulse_cost: 2`, `pulse_cooldown_s: 4.0`, `pulse_radius: 7.0`, `pulse_push_m: 6.0`, `pulse_stun_s: 3.0` |
| Thời lượng Đêm 1 & Điểm số | Đêm 1 dài `300 s` (5 phút). Nhặt đom đóm `+10`, thắp đèn `+100`, làm choáng Bóng Mực `+25`. Khi thắng (`all_lit`) cộng thưởng `floor(time_left_s) * 2 + flames * 50`. | `night1_duration_s: 300`, `score.*` |
| Sinh đom đóm & Bóng Mực tự động | Khi chơi thường (`random_motes: true`), bắt đầu với 24 đom đóm và bổ sung mỗi `4 s` nếu dưới 20. Khi `random_shades: true`, bắt đầu 2 Bóng Mực và sinh thêm mỗi `45 s` (tối đa 5, phát `shade_spawned`). Khi scenario tắt cờ, không tự sinh. | seed-based Mulberry32 PRNG |

## 2. Tiêu chí Nghiệm thu (Kiểm chứng trước khi code)
1. **AC-1 (Di chuyển & Xoay camera):** Input `[0, 1]` với `cam_yaw_deg = 90` dịch chuyển đúng theo `+X` với vận tốc `player_speed`; vector `[1, 1]` chuẩn hóa về độ dài 1.
2. **AC-2 (Nhặt đom đóm & Giới hạn mang):** Đi vào `pickup_radius` phát `mote_picked`, cộng `per_mote`, dừng nhặt khi `carried == carry_capacity`.
3. **AC-3 (Nạp & Thắp đèn & Thắng):** Bấm `interact` (rising edge) trong `interact_radius` phát `deposit`; đủ `lantern_cost` phát `lantern_lit`; đủ 5 đèn phát `game_over (won, all_lit)` kèm điểm thưởng.
4. **AC-4 (Tỏa sáng Pulse):** Bấm `pulse` khi đủ `pulse_cost` và hết hồi chiêu trừ `pulse_cost`, đẩy Bóng Mực trong `pulse_radius` ra `pulse_push_m`, chuyển `state = "stunned"` trong `pulse_stun_s`, phát `pulse`.
5. **AC-5 (Bóng Mực & Vùng an toàn & Thua):** Bóng Mực đuổi Mây nhưng không vượt vào `safe_radius` của đèn đã thắp; chạm Mây phát `player_hit`, rơi đom đóm và bất tử `invuln_s`; hết máu phát `game_over (lost, no_flames)`; hết giờ phát `game_over (lost, dawn)`.
6. **AC-6 (Tất định & Lỗi định dạng):** Chạy 2 lần cùng seed ra file JSONL giống hệt từng byte; input sai tick tăng dần trả mã thoát `2`.
7. **AC-7 (Đồ họa 3D & Build):** Chạy `npm run build` đóng gói web tĩnh Three.js không lỗi; game chơi được trên trình duyệt (WASD, Space, E, Shift, camera 3D, HUD, Chơi lại).
