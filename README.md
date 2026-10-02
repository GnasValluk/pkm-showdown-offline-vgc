# PKM Showdown Offline — VGC 2026 Reg M-C

Bản Pokémon Showdown **offline, mở là chơi với bot**, format **[Gen 9 Champions] VGC 2026 Regulation M-C** (Pokémon Champions, gồm 6 Mega mới M-C).

## Chơi ngay (Windows + Node.js LTS)

Double-click **`GAME.EXE`** → bấm **▶ CHƠI NGAY** → trình duyệt tự mở `http://localhost:8080`.
Tắt cửa sổ GAME (hoặc bấm **■ DỪNG**) là server tắt theo.

```bat
Cap-Nhat.bat     :: cap nhat theo Smogon moi nhat (can mang)
```

Mở `http://localhost:8080` → chọn tên bất kỳ → import team mẫu trong `teams/` → challenge `OfflineBot`.

> Chi tiết tiếng Việt: xem [HUONG-DAN.txt](HUONG-DAN.txt).

## Cấu trúc

| Thư mục/file | Mô tả |
|---|---|
| `showdown/` | Source server Smogon (submodule, branch master) |
| `client-tmp/` | Source client Smogon (submodule) |
| `client/` | Web offline đã build + bundle data |
| `bot/bot.js` | Bot VGC doubles (Mega, target, switch) |
| `teams/` | 3 team mẫu hợp lệ Reg M-C (Stat Points 66) |
| `GAME.EXE` / `GAME.cs` | App 1-click: bấm CHƠI NGAY / DỪNG, tắt app là tắt server |
| `update.js` | Đồng bộ bản mới + patch offline + validate team |
| `client/style/custom-offline.css` | Theme riêng (update không ghi đè) |

## Luật Champions (khác VGC cũ)

- **Stat Points**: tối đa 32/chỉ số, tổng **66** (không phải EV 508)
- **IV 31** tất cả
- Nhiều item cũ bị cấm (Assault Vest, Choice Specs, Covert Cloak, Safety Goggles…)
- Mega hợp lệ, gồm Mega Salamence / Golisopod / Baxcalibur / Absol Z / Garchomp Z / Lucario Z

## Nguồn

- Server: https://github.com/smogon/pokemon-showdown
- Client: https://github.com/smogon/pokemon-showdown-client
