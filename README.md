# Gorani: free plugin for site 3D modeling and analysis

**Site 3D modeling and analysis.** 사이트 3D 모델링 및 분석.

Pick a site and get 3D terrain and 2D analysis drawings. A free plugin for Rhino 7 and 8, SketchUp and Blender, on Windows and macOS.

대상지를 고르면 3D 지형과 2D 분석 자료를 생성합니다. 라이노, 스케치업, 블렌더에서 작동하는 무료 플러그인입니다.

- Website: https://969flash.github.io/gorani/ (한국어) · https://969flash.github.io/gorani/en/ (English) · https://969flash.github.io/gorani/ja/ (日本語) · https://969flash.github.io/gorani/zh/ (简体中文) · https://969flash.github.io/gorani/es/ (Español)
- For AI tools: [llms.txt](https://969flash.github.io/gorani/llms.txt)

## Install

- Rhino 7 and 8: `PackageManager`, search `Gorani`, install, restart Rhino, run `Gorani`.
- SketchUp 2022+: download [bsh_gorani-0.3.7.rbz](https://github.com/969flash/gorani-plugin/releases/download/v0.3.7/bsh_gorani-0.3.7.rbz), then Extensions > Extension Manager > Install Extension (Extension Warehouse listing pending approval).
- Blender 4.2+: Edit > Preferences > Get Extensions, search `Gorani`, install ([listing](https://extensions.blender.org/add-ons/gorani/)).
- AutoCAD (2D drawing, Autodesk App Store listing pending approval): Windows — download [Gorani-autocad-win-0.3.6.zip](https://github.com/969flash/gorani-plugin/releases/download/v0.3.7/Gorani-autocad-win-0.3.6.zip), unblock and extract it, move `Gorani.bundle` to `C:\Program Files\Autodesk\ApplicationPlugins`. macOS — download [Gorani-autocad-mac-0.3.6.zip](https://github.com/969flash/gorani-plugin/releases/download/v0.3.7/Gorani-autocad-mac-0.3.6.zip), move `Gorani.bundle` to `~/Library/Application Support/Autodesk/ApplicationAddins` and run `xattr -dr com.apple.quarantine` on it once. Then restart AutoCAD and run `GORANI`.

## Coverage

Coverage status on the website was last checked on 2026-10-23. Dataset-specific reference dates are printed in generated drawings and `log.txt`.

- **Korea, nationwide**: cadastre, buildings, 1:5,000 terrain, zoning; analysis maps (figure-ground, zoning, land use, street hierarchy, building age and more).
- **Japan**: PLATEAU buildings and road surfaces (MLIT), GSI 5 m terrain.
- **Netherlands, France, Switzerland**: official building footprints with measured heights (Kadaster 3D Basisvoorziening, IGN BD TOPO, swisstopo swissBUILDINGS3D).
- **United States**: Overture Maps buildings (Microsoft ML Buildings, OpenStreetMap, Esri; heights mostly ML estimates), 3,234 counties.
- **Elsewhere**: OpenStreetMap buildings and roads, public terrain tiles.

## This repository

This repository holds the website (GitHub Pages, plain HTML/CSS/JS, no build step) and is where issues and release notes live. Report problems in [Issues](https://github.com/969flash/gorani/issues) with `log.txt` from the result folder (`~/Gorani/result/<site>_<date>/`) attached.

Data: © OpenStreetMap contributors (ODbL); Korean public data from MOLIT, NGII and Seoul Metropolitan Government, with sources printed on every drawing. Rhino is a trademark of Robert McNeel & Associates, SketchUp of Trimble Inc., Blender of the Blender Foundation, AutoCAD of Autodesk, Inc.; this project is not affiliated with them.
