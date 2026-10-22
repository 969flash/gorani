# Gorani: free plugin for site 3D modeling and analysis

**Site 3D modeling and analysis.** 사이트 3D 모델링 및 분석.

Pick a site and get 3D terrain and 2D analysis drawings. A free plugin for Rhino 8, SketchUp and Blender, on Windows and macOS.

대상지를 고르면 3D 지형과 2D 분석 자료를 생성합니다. 라이노, 스케치업, 블렌더에서 작동하는 무료 플러그인입니다.

- Website: https://969flash.github.io/gorani/ (한국어) · https://969flash.github.io/gorani/en/ (English) · https://969flash.github.io/gorani/ja/ (日本語) · https://969flash.github.io/gorani/zh/ (简体中文) · https://969flash.github.io/gorani/es/ (Español)
- For AI tools: [llms.txt](https://969flash.github.io/gorani/llms.txt)

## Install

- Rhino 8: `PackageManager`, search `Gorani`, install, restart Rhino, run `Gorani`.
- SketchUp 2022+: Extensions > Extension Warehouse, search `Gorani`, install.
- Blender 4.2+: Edit > Preferences > Get Extensions, search `Gorani`, install.

## Coverage

- **Korea, nationwide**: cadastre, buildings, 1:5,000 terrain, zoning; analysis maps (figure-ground, zoning, land use, street hierarchy, building age and more).
- **Japan**: PLATEAU buildings (MLIT), GSI 5 m terrain, OpenStreetMap roads.
- **Netherlands, France**: official building footprints with measured heights (Kadaster 3D Basisvoorziening, IGN BD TOPO).
- **Elsewhere**: OpenStreetMap buildings and roads, public terrain tiles.

## This repository

This repository holds the website (GitHub Pages, plain HTML/CSS/JS, no build step) and is where issues and release notes live. Report problems in [Issues](https://github.com/969flash/gorani/issues) with `log.txt` from the result folder (`~/Gorani/result/<site>_<date>/`) attached.

Data: © OpenStreetMap contributors (ODbL); Korean public data from MOLIT, NGII and Seoul Metropolitan Government, with sources printed on every drawing. Rhino is a trademark of Robert McNeel & Associates, SketchUp of Trimble Inc., Blender of the Blender Foundation; this project is not affiliated with them.
