#!/bin/zsh
# 시연 영상(가로 16:9) — 따로 찍은 전체 화면 컷과 확대 컷을 이어 붙여 웹용 assets/demo.mp4·demo-poster.webp로 만든다
#
# 촬영: 화면 확대는 편집에서 잘라 키우지 않고 찍을 때 확대한다(잘라 키우면 흐려진다)
#   전체 컷  Rhino 창과 Gorani 패널이 함께 보이게 놓고 16:9 영역(예: 2560×1440)을 Cmd+Shift+5로 녹화
#   확대 컷  같은 16:9 영역 그대로, 패널은 Cmd+= 로 키우고 Rhino는 뷰를 당겨서 녹화
#   어느 컷이든 (자른) 녹화 폭이 출력 폭보다 작으면 경고한다
#
# 컷 목록(shots.txt) 한 줄에 한 컷: 파일 시작초 끝초 [x y w h [배속]]   (# 은 주석, 자르기는 원본 픽셀, 16:9로)
#   wide.mov     0    6.2
#   panel-zoom.mov 1.5 4.8
#   rhino.mov    3    9    0 0 2560 1440
#   wait.mov     10   40   0 0 2560 1440 4      ← 기다리는 구간은 4배속
#
# zsh tools/demo_16x9.sh shots.txt [출력 폭=1600] [맞물림 초=0.35] [화질 CRF=28, 낮을수록 좋고 무겁다]
# 필요: ffmpeg, cwebp(brew install ffmpeg webp). 끝나면 index.html·en/index.html의 data-at, site.js의 END·CAPTIONS를 새 길이에 맞춘다
set -euo pipefail
list=$1; W=${2:-1600}; X=${3:-0.35}; Q=${4:-28}; H=$(( W * 9 / 16 ))
root=${0:A:h:h}; tmp=$(mktemp -d); trap 'rm -rf $tmp' EXIT
i=0; durs=()
while read -r line; do
  read -r f a b x y w h sp <<< "${line%%\#*}"   # 줄 끝 # 주석은 뺀다
  [[ -z ${f:-} ]] && continue
  sw=${w:-$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$f")}
  (( sw < W )) && print -u2 "경고: $f 폭 ${sw}px — 출력 ${W}보다 작아 키우면 흐려진다. 확대해서 다시 찍기"
  crop=""; [[ -n ${w:-} ]] && crop="crop=$w:$h:$x:$y,"; sp=${sp:-1}
  ffmpeg -nostdin -v error -y -ss $a -to $b -i "$f" -an \
    -vf "${crop}setpts=(PTS-STARTPTS)/$sp,scale=$W:$H:force_original_aspect_ratio=decrease:flags=lanczos,pad=$W:$H:(ow-iw)/2:(oh-ih)/2:white,fps=30,format=yuv420p" \
    -c:v libx264 -crf 12 -preset fast $tmp/$i.mp4
  durs+=( $(( (b - a) / (sp * 1.0) )) ); i=$(( i + 1 ))
done < $list
(( i > 0 )) || { print -u2 "컷이 없다"; exit 1; }

# 컷 사이를 짧게 겹쳐 넘긴다(확대 컷으로 넘어갈 때 튀지 않게)
inputs=(); for k in {0..$(( i - 1 ))}; do inputs+=(-i $tmp/$k.mp4); done
if (( i == 1 )); then cp $tmp/0.mp4 $tmp/all.mp4; else
  g=""; prev="[0:v]"; off=0
  for k in {1..$(( i - 1 ))}; do
    off=$(( off + durs[k] - X ))
    g+="${prev}[${k}:v]xfade=transition=fade:duration=$X:offset=${off}[v${k}];"; prev="[v${k}]"
  done
  ffmpeg -nostdin -v error -y $inputs -filter_complex "${g%;}" -map "$prev" -pix_fmt yuv420p -c:v libx264 -crf 12 -preset fast $tmp/all.mp4
fi

# 웹용: 소리 없음, 처음부터 바로 재생(faststart), 첫 장면을 포스터로
ffmpeg -nostdin -v error -y -i $tmp/all.mp4 -an -pix_fmt yuv420p -c:v libx264 -profile:v high -preset slow -crf $Q -g 90 -movflags +faststart $root/assets/demo.mp4
ffmpeg -nostdin -v error -y -i $root/assets/demo.mp4 -frames:v 1 $tmp/poster.png
cwebp -quiet -q 82 $tmp/poster.png -o $root/assets/demo-poster.webp
ffprobe -v error -show_entries format=duration,size -of default=nw=1 $root/assets/demo.mp4
print "크기 ${W}×${H}. 페이지 video의 width·height와 VideoObject duration도 맞출 것"
