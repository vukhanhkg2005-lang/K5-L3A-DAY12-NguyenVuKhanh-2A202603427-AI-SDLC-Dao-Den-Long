# Đánh giá Phase 1 (Evaluation)

## 1. Kết quả so với mục tiêu PRD-0
- **Đạt 100% yêu cầu lõi PRD-0 & Test Contract v1.0:**
  - 9/9 unit tests đạt (`tests/sim.test.js`).
  - 6/6 kịch bản headless end-to-end đạt (`tests/run-scenarios.js`), bao gồm thắng (`all_lit`), Pulse stun/push, thua (`no_flames`), vùng an toàn `safe_radius`, tất định byte-for-byte (`SHA-256` giống hệt nhau), và mã thoát `2` khi lỗi định dạng.
  - Bản 3D WebGL (Vite + Three.js) build sạch (`npm run build`), hiển thị Mây đội nón lá treo đèn lồng nhỏ, 5 Đèn Lồng Lớn sáng dần đảo, đom đóm phát sáng, Bóng Mực tím đen, HUD đầy đủ và nút Chơi lại.
- **Sáng tạo gọn nhẹ không phá Contract:** Biển mây trôi quanh đảo, bầu trời sao, hiệu ứng nhịp thở đom đóm và âm thanh procedural Web Audio API nằm hoàn toàn trong `src/render/`, không bao giờ được nạp ở chế độ headless.

## 2. Điểm cần lưu ý / chuẩn bị cho Phase 2
- Hiện tại `dist/assets/index-*.js` hơi lớn (~509 kB vì gom chung `three`); ở Phase 2/4 có thể cấu hình `manualChunks` trong `vite.config.js` để tách vendor chunk và tối ưu tải trang.
- Kiến trúc `src/sim/simulation.js` đã tách rõ phần `tuning`, `prng`, `validators`, `math`, nên sẵn sàng bổ sung cơ chế mới hoặc nhiều Đêm hơn khi nhận `Ticket-02`.

## 3. Cập nhật Harness AI sau Phase 1
- Đã cố định 4 quy tắc cốt lõi trong `AGENTS.md`, tạo skill `verify-phase`, cấu hình hook kiểm tra tự động trong `.claude/settings.json` và thiết lập CI GitHub Actions `.github/workflows/ci.yml`.
