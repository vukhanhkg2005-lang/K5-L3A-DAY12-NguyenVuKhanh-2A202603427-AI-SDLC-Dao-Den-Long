# Credits & Asset Attribution

## Original Lab Concept
- Nhân vật (Mây, Ông Đăng, Bóng Mực, Gió Lạc), bối cảnh (Đảo Đèn Lồng, Đảo Bến, Đảo Cau, Đảo Chuông) và kịch bản gameplay thuộc tài liệu gốc của Day 12 AI SDLC Lab.

## 3D Models, Materials & Procedural Textures
- Toàn bộ hình khối 3D (ba hòn đảo, cầu tre, vách tầng, dốc gỗ, tháp chuông, bục nhảy, Đèn Lồng Lớn, nhân vật Mây đội nón lá treo đèn lồng, đom đóm `InstancedMesh`, Bóng Mực `InstancedMesh`, khu rừng đêm 5 loại cây & tầng thấp `InstancedMesh`, dải lụa Gió Lạc, Bùa Gió, thanh nhiên liệu 3D, biển mây, bầu trời shader bình minh/mặt trời mọc, lá bay & hạt VFX) và texture vết rách giấy đèn / quầng sáng đều được **tạo 100% bằng mã nguồn (procedural)** trong `src/render/scene.js`, `src/render/forest.js` và `src/render/vfx.js`. Không sử dụng model hay texture thương mại bên ngoài.

## Audio
- Nhạc nền đêm ngũ âm và toàn bộ hiệu ứng SFX (nhặt đom đóm, nhặt Bùa Gió, nạp/châm dầu, thắp đèn, đèn tắt, Tỏa Sáng, bị đánh/rơi, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, Gió Lạc cướp, đếm ngược 10 s cuối, gió mạnh) đều được **tổng hợp 100% bằng Web Audio API** trong `src/render/audio.js`. Không sử dụng tệp âm thanh bên ngoài.

## Open-Source Libraries & Fonts
- [Three.js](https://threejs.org/) (`^0.170.0`) — MIT License (WebGL 3D renderer)
- [Vite](https://vitejs.dev/) (`^6.0.7`) — MIT License (static bundler & dev server)
- [Be Vietnam Pro](https://fonts.google.com/specimen/Be+Vietnam+Pro) (`src/assets/fonts/`, bundled offline `.woff2`) — SIL Open Font License 1.1 (Vietnamese UI typography)
- Node.js built-in modules (`node:http`, `node:fs`, `node:test`, `node:assert`, `node:child_process`) — MIT License

## AI Tools Used
- **Antigravity AI Agent (Gemini):** Hỗ trợ phân tích yêu cầu, thiết kế kiến trúc tách sim/render, viết mã nguồn, tối ưu hóa hiệu năng (`InstancedMesh`, zero-allocation simulation loop), tạo bộ test tự động, ADR, báo cáo và retro (chi tiết tại `docs/notes/ai-log.md` và `docs/retro.md`).
