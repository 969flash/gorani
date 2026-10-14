# UrbanSite — free Rhino 8 plugin for site context models

**The city around your site, modeled in Rhino.**
필지를 고르면 주변 건물과 지형이 Rhino에 들어옵니다.

UrbanSite builds the surrounding buildings, roads, terrain, water, green space and rail of a site as 3D layers in your open Rhino 8 document, and writes a layered Illustrator basemap, urban analysis maps and CSV tables next to it. Free, no account. Windows and macOS.

UrbanSite(대지검토)는 대상지를 고르면 주변 건물·도로·지형·수계·녹지·철도를 Rhino 8 문서에 3D로 만들고, 일러스트레이터 베이스맵과 도시설계 현황·분석도, 조서 CSV를 함께 내는 무료 플러그인입니다.

- Website: https://969flash.github.io/urbansite/ (한국어) · https://969flash.github.io/urbansite/en/ (English)
- For AI tools: [llms.txt](https://969flash.github.io/urbansite/llms.txt)

## Install

Rhino 8 → `PackageManager` → search `UrbanSite` → install → restart Rhino → run `UrbanSite`.

> Pre-release: the package is not on the Rhino package server (Yak) yet. Watch this repository's releases for the launch.

## Coverage

- **Korea, nationwide** — cadastre, buildings, 1:5,000 terrain, zoning; analysis maps (figure-ground, zoning, land use, street hierarchy, building age and more).
- **Elsewhere** — OpenStreetMap buildings and roads, public terrain tiles.

## This repository

This repository holds the website (GitHub Pages, plain HTML/CSS/JS, no build step) and is where issues and release notes live. Report problems in [Issues](https://github.com/969flash/urbansite/issues) with `log.txt` from the result folder attached.

Data: © OpenStreetMap contributors (ODbL); Korean public data from MOLIT, NGII and Seoul Metropolitan Government, with sources printed on every drawing. Rhino is a trademark of Robert McNeel & Associates; this project is not affiliated with McNeel.
