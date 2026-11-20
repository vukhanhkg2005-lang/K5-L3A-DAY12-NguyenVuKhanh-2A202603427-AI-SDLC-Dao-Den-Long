# Bằng chứng Kiểm chứng — Phase 1 (PRD-0 & Test Contract v1.0)

Tất cả file log/JSONL trong thư mục này được sinh trực tiếp từ mã nguồn thực tế (không chỉnh sửa tay).

## 1. Bảng truy vết Yêu cầu $\rightarrow$ Bằng chứng

| Yêu cầu (PRD-0 / Contract v1.0) | Cách kiểm chứng | Bằng chứng thực tế | Kết quả |
|---|---|---|---|
| **game.contract.json** đúng schema & single source of truth | `tests/sim.test.js` + `src/headless.js` + `src/main.js` đọc trực tiếp từ `game.contract.json` | [game.contract.json](../../../game.contract.json), [test_output.txt](test_output.txt) | **Đạt** |
| **Di chuyển, xoay `cam_yaw_deg`, chuẩn hóa vector** | Unit test `transformMoveInput` + scenario `s1_win` (`move: [0,1]`, tốc độ `6.0 m/s`) | [test_output.txt](test_output.txt), [s1_win.jsonl](s1_win.jsonl) | **Đạt** |
| **Nhặt đom đóm & giới hạn `carry_capacity`** | Unit test `mote pickup respects carry_capacity` + scenario `s1_win` (nhặt 4 đom đóm ở tick 14, 34, 54, 74) | [test_output.txt](test_output.txt), [s1_win.jsonl](s1_win.jsonl) | **Đạt** |
| **Nạp đèn, thắp sáng 5 Đèn Lồng Lớn & Thắng (`all_lit`)** | Unit test + scenario `s1_win` (tick 111: `deposit` $\rightarrow$ `lantern_lit` $\rightarrow$ `game_over won all_lit`, điểm `646`) | [s1_win.jsonl](s1_win.jsonl) | **Đạt** |
| **Tỏa sáng (Pulse): tốn đom đóm, đẩy lùi, choáng, hồi chiêu** | Unit test + scenario `s2_pulse` (tick 1: `pulse`, `S1` đẩy từ `5` ra `11`, `stunned` suốt 180 tick rồi `chase` lại) | [s2_pulse.jsonl](s2_pulse.jsonl) | **Đạt** |
| **Bóng Mực đuổi, gây sát thương, rơi đom đóm, bất tử & Thua (`no_flames`)** | Unit test (`invuln_s = 2.0s` chặn hit suốt 119 tick) + scenario `s3_loss` (tick 21: `player_hit`, `game_over lost no_flames`) | [test_output.txt](test_output.txt), [s3_loss.jsonl](s3_loss.jsonl) | **Đạt** |
| **Bóng Mực sợ đèn đã thắp (`safe_radius`)** | Unit test + scenario `s4_safe_radius` (`S1` dừng ngoài `7.05 m > safe_radius = 7.0 m` suốt 300 tick, 0 lần chạm) | [s4_safe_radius.jsonl](s4_safe_radius.jsonl) | **Đạt** |
| **Hết giờ Đêm 1 (`dawn`)** | Unit test `dawn timeout triggers game_over lost with reason dawn` (đúng tick 60 với `time_left_s = 1.0`) | [test_output.txt](test_output.txt) | **Đạt** |
| **Tính tất định 100% (Determinism)** | Chạy 2 lần `seed=2026`, `ticks=600` ra `det_run1.jsonl` & `det_run2.jsonl`, so SHA-256 | [det_run1.jsonl](det_run1.jsonl), [det_run2.jsonl](det_run2.jsonl) — SHA-256 trùng khớp `35591854...666080731` | **Đạt** |
| **Lỗi định dạng inputs/scenario $\rightarrow$ mã thoát `2`** | Unit test `validators` + scenario `S6` chạy CLI với tick không tăng dần | [test_output.txt](test_output.txt) | **Đạt** |
| **Game 3D WebGL + HUD + Chơi lại + Build tĩnh** | `npm run build` (Vite + Three.js đóng gói không lỗi) + smoke test preview local | `dist/` build thành công (`1.23s`), kiểm tra HTTP 200 | **Đạt** |

## 2. Lệnh tái lập toàn bộ bằng chứng
```bash
npm ci && npm run build
npm test
```
