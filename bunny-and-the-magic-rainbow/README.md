# Bunny and the Magic Rainbow 🌈🐰

A 2-minute animated cartoon for children aged 4–5, made entirely with code:
HTML5 Canvas for the animation, synthesized music and sound effects, and
offline neural text-to-speech for the voices.

One morning the rainbow over the Colorful Forest loses its colors. Bobo the
bunny and his best friend Mimi the baby bear set off to find them. Each color
comes back when they help a friend. At the end, everyone works together to
bring the whole rainbow back.

**Lesson:** *When we help our friends, the whole world gets brighter.*

| | |
|---|---|
| Length | 120 s (6 scenes × 20 s) |
| Video | 1920 × 1080, 16:9, 30 fps, H.264 |
| Audio | Stereo AAC, about −14 LUFS, dialogue ducked over the music |
| Subtitles | Burned into the picture, plus a soft English track in the MP4 and an `.srt` file |

---

## Watch it

* **MP4:** `output/bunny-and-the-magic-rainbow.mp4`, once you've run the export below.
* **Interactive preview:** run `npm run preview` (or `node tools/serve.mjs`) and open <http://localhost:8080>.
  The player has play/pause, a seek bar, scene buttons, subtitles on/off and full screen.
  Keys: `Space`, `←`/`→`, `1`–`6`, `C`, `F`.

You can also open `index.html` straight from disk. Use the local server if you
want to use the **Record video** button, because browsers block audio capture
for `file://` pages.

---

## The story, scene by scene

| # | Time | Scene | What happens | Color found |
|---|------|-------|--------------|-------------|
| 1 | 0:00 | Good Morning, Forest! | The title card appears and the sleepy sun rises. Bobo hops out of his burrow, stretches, yawns and waves. The rainbow wobbles, then *poof!* Its colors fly away as little stars. "Oh no!" | — |
| 2 | 0:20 | Mimi and the Stuck Kite | Mimi rolls down the hill and lands with a *bonk* (dizzy stars, giggles). The friends high-five. Pip the bird's kite is stuck in a tree, so Bobo climbs onto Mimi's head and frees it. | red, orange |
| 3 | 0:40 | Thirsty Sunflowers | Bizzy the bee's sunflowers are droopy. Mimi waters them one by one and each pops up smiling. The biggest one glows. | yellow |
| 4 | 1:00 | Hoppy's Pond | Hoppy the frog says "Can you hop like me?" Bobo hops across lily pads while counting 1-2-3. Mimi jumps and lands with a big SPLASH, then wears a lily pad as a hat. | blue, green |
| 5 | 1:20 | Nutty's Berries | Nutty the squirrel trips and the berries go everywhere. Bobo and Mimi count them back into the basket: 1-2-3-4-5. "You are so kind!" | purple |
| 6 | 1:40 | The Rainbow Returns | All the friends gather. "One, two, three… Rainbow!" The stars paint the rainbow back across the sky. Then come confetti, dancing, the lesson, "Bye-bye, friends!" and **The End**. | all six |

There is a new action or visual moment every 2–6 seconds. The colors found so
far fill a small rainbow meter in the top-left corner, so children can follow
along.

---

## Project layout

```
index.html              preview player (canvas + controls + soundtrack)
render.html             bare render target used by the MP4 exporter
src/engine.js           drawing kit: characters, nature, rainbow, stars, text
src/scenes.js           the six scenes, HUD meter, title/end cards, transitions, subtitles
src/timeline.js         GENERATED: dialogue timing, lip-sync envelopes, sfx cues
story/story.json        THE SCRIPT: every line of dialogue, who says it, when; voices; sfx cues
tools/build_audio.py    voices (Piper TTS) + original music + sound effects -> soundtrack + timeline + .srt
tools/export_mp4.mjs    headless Chromium renders every frame -> ffmpeg -> MP4
tools/serve.mjs         tiny local web server for the preview
tools/get_voices.sh     downloads the two free Piper voice models
audio/soundtrack.mp3    GENERATED mixed soundtrack (the .wav is used for the export)
subtitles/*.srt         GENERATED subtitles
assets/fonts/           Fredoka (SIL Open Font License, from Google Fonts)
```

The animation is **deterministic**: `CARTOON.render(ctx, t)` draws the exact
frame for any time `t`. Seeking is instant, and the export matches the preview
frame for frame.

---

## Export to MP4

Requirements: **Node 18+**, **ffmpeg**, and **Python 3.9+** (Python is only needed if you rebuild the audio).

```bash
cd bunny-and-the-magic-rainbow
npm install                      # installs Playwright
npx playwright install chromium  # one-time browser download
npm run export                   # -> output/bunny-and-the-magic-rainbow.mp4
```

Options:

```bash
node tools/export_mp4.mjs --workers 4           # parallel render workers (default: up to 4)
node tools/export_mp4.mjs --scale 0.5 --out output/preview-540p.mp4   # fast low-res draft
node tools/export_mp4.mjs --from 40 --to 60 --out output/scene3.mp4   # one scene only
node tools/export_mp4.mjs --fps 60 --crf 16                           # smoother / higher quality
```

On a 4-core machine the full 1080p export takes a few minutes.

**Browser-only option (no Node needed):** serve the folder (`python3 -m http.server`),
open the page and click **Record video**. The cartoon plays once in real time and
then downloads a `.webm` file. To convert it to MP4:
`ffmpeg -i bunny-and-the-magic-rainbow.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac out.mp4`

---

## Rebuild the soundtrack (after editing the script)

All dialogue lives in `story/story.json`. Change a line, a start time, a voice
or a sound-effect cue there, then run:

```bash
pip install -r requirements.txt   # numpy, scipy, piper-tts
./tools/get_voices.sh             # ~140 MB of free Piper voice models -> build/voices
python3 tools/build_audio.py      # rebuilds audio/, src/timeline.js and subtitles/
```

The builder prints every line with its start and end times. It warns you if two
lines overlap or if a line runs past the end of its scene. Mouth movements and
subtitles follow the new audio automatically. If you move an *action* (a jump,
a splash), change its time in `src/scenes.js` as well. The matching times there
are written in absolute seconds, the same as in `story.json`.

### How the sound is made

* **Voices:** [Piper](https://github.com/rhasspy/piper) neural TTS, running fully offline. Each
  character has their own voice and pitch (Bobo is bright and high, Mimi is warm,
  Hoppy is a little lower, Pip is chirpy). Lines like "One, two, three… Rainbow!"
  are sung by the whole cast together.
* **Music:** an original, cheerful tune at 120 BPM in C major (ukulele-style strums,
  marimba melody, soft bass and shaker, glockenspiel sparkles). It is written note by
  note in `build_audio.py` and synthesized with numpy, with no samples. It ducks under
  the dialogue and builds to a finale.
* **Sound effects:** about 30 synthesized effects, including boing, pop, twinkle, splash,
  ribbit, buzz, slide whistle, bonk, drum roll and fanfare.

---

## Characters

| | Look | Voice |
|---|---|---|
| **Bobo** | white bunny, long pink-lined ears, teal scarf | bright, excited |
| **Mimi** | round baby bear, pink bow, honey muzzle | warm, giggly |
| **Pip** | little blue bird | chirpy |
| **Bizzy** | round bee | buzzy, cheerful |
| **Hoppy** | green frog with big top eyes | bouncy |
| **Nutty** | orange squirrel with a curly tail | quick, squeaky |
| Narrator | — | gentle storyteller |

## Credits & licenses

* Story, animation code, music and sound effects: original, made for this project.
* Font: Fredoka by Milena Brandão, SIL Open Font License 1.1.
* Voices: Piper voice models `en_US-libritts_r-medium` (dataset: LibriTTS-R, CC BY 4.0) for the
  characters, and `en_US-amy-medium` (mimic3 voices, fine-tuned from the Lessac voice) for the narrator.
  **Before you publish commercially**, check those model cards' dataset licenses. If you need to, swap
  the narrator for another libritts_r speaker in `story/story.json` or record real voice actors. The
  pipeline takes any per-line audio.
