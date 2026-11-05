#!/usr/bin/env python3
"""
Build every sound in "Bunny and the Magic Rainbow".

  * Dialogue  -> Piper neural TTS (offline), pitch-shifted per character with ffmpeg/rubberband
  * Music     -> original tune, synthesized note-by-note with numpy (no samples)
  * SFX       -> synthesized with numpy (boing, pop, splash, twinkle, ...)

Outputs
  src/timeline.js          dialogue timing + lip-sync envelopes + sfx cues (used by the animation)
  audio/soundtrack.mp3     final mixed soundtrack (music + sfx + voices), exactly 120 s
  audio/soundtrack.wav     same, lossless (used for the MP4 export)
  subtitles/bunny-and-the-magic-rainbow.srt

Usage
  python3 tools/build_audio.py --voices /path/to/piper/voices
"""
import argparse, json, math, os, subprocess, sys, wave, hashlib
import numpy as np
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
RNG = np.random.default_rng(7)


# ----------------------------------------------------------------------------- helpers
def tvec(dur):
    return np.arange(int(dur * SR)) / SR


def env_adsr(n, a=0.005, r=0.05):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    na, nr = min(na, n), min(nr, n)
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def bp(x, lo, hi, order=2):
    sos = butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band", output="sos")
    return sosfilt(sos, x)


def lp(x, f, order=2):
    sos = butter(order, f / (SR / 2), btype="low", output="sos")
    return sosfilt(sos, x)


def hp(x, f, order=2):
    sos = butter(order, f / (SR / 2), btype="high", output="sos")
    return sosfilt(sos, x)


def chirp(f0, f1, dur, curve=1.0):
    t = tvec(dur)
    f = f0 + (f1 - f0) * (t / dur) ** curve
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


NOTE_IDX = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def nf(name):
    """'C5', 'F#4', 'Bb3' -> Hz"""
    n = NOTE_IDX[name[0]]
    i = 1
    if name[i] == "#":
        n += 1; i += 1
    elif name[i] == "b":
        n -= 1; i += 1
    octv = int(name[i:])
    midi = 12 * (octv + 1) + n
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(buf, sig, t0, gain=1.0):
    i = int(round(t0 * SR))
    if i >= len(buf):
        return
    if i < 0:
        sig = sig[-i:]; i = 0
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


# ----------------------------------------------------------------------------- instruments
def pluck(f, dur=0.6, amp=1.0):
    t = tvec(dur + 0.35)
    s = np.zeros_like(t)
    for k in range(1, 9):
        if f * k > 9000:
            break
        s += (1 / k ** 1.3) * np.exp(-t * (2.5 + k * 2.2)) * np.sin(2 * np.pi * f * k * t + k)
    return s * env_adsr(len(t), 0.003, 0.12) * amp


def marimba(f, dur=0.4, amp=1.0):
    t = tvec(max(dur, 0.25) + 0.5)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t * 4.5)
         + 0.28 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 16)
         + 0.08 * np.sin(2 * np.pi * 9.9 * f * t) * np.exp(-t * 40))
    return s * env_adsr(len(t), 0.002, 0.08) * amp


def glock(f, amp=1.0, dur=1.2):
    t = tvec(dur)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.4)
         + 0.35 * np.sin(2 * np.pi * 2.756 * f * t) * np.exp(-t * 6)
         + 0.15 * np.sin(2 * np.pi * 5.404 * f * t) * np.exp(-t * 12))
    return s * env_adsr(len(t), 0.001, 0.1) * amp


def bass(f, dur, amp=1.0):
    t = tvec(dur + 0.08)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    return s * np.exp(-t * 1.6) * env_adsr(len(t), 0.01, 0.08) * amp


def kick(amp=1.0):
    t = tvec(0.25)
    f = 45 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14) * amp


def shaker(amp=1.0):
    t = tvec(0.07)
    return hp(RNG.standard_normal(len(t)), 6000) * np.exp(-t * 60) * amp


def clapsnd(amp=1.0):
    t = tvec(0.18)
    n = bp(RNG.standard_normal(len(t)), 900, 3500)
    e = np.exp(-t * 28) + 0.6 * np.exp(-((t - 0.012) * 400) ** 2)
    return n * e * amp


def brass(f, dur, amp=1.0):
    t = tvec(dur + 0.1)
    saw = 2 * ((f * t + 0.1 * np.sin(2 * np.pi * 5.5 * t) / 5.5) % 1.0) - 1
    s = lp(saw, 2200)
    return s * env_adsr(len(t), 0.03, 0.12) * amp


# ----------------------------------------------------------------------------- sound effects
_grow_count = [0]


def sfx(kind, *params):
    if kind == "twinkle":
        out = np.zeros(int(0.9 * SR))
        for k, n in enumerate(["E7", "C7", "G6", "E7", "G7"]):
            add(out, glock(nf(n), 0.35, 0.6), k * 0.06)
        return out * 0.7
    if kind == "chirp":
        out = np.zeros(int(0.35 * SR))
        for k in range(3):
            c = chirp(2600 + 300 * k, 3900, 0.06, 0.5) * np.hanning(int(0.06 * SR))
            add(out, c, k * 0.085, 0.25)
        return out
    if kind == "pop":
        t = tvec(0.09)
        return chirp(380, 1100, 0.09, 0.4) * np.exp(-t * 45) * 0.6
    if kind == "boing":
        t = tvec(0.42)
        f = 170 + 420 * (t / 0.42) + 35 * np.sin(2 * np.pi * 16 * t)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)
        return s * np.exp(-t * 6) * env_adsr(len(t), 0.004, 0.05) * 0.38
    if kind == "yawn_chime":
        out = np.zeros(int(1.6 * SR))
        for k, n in enumerate(["G6", "E6", "C6"]):
            add(out, glock(nf(n), 0.3), k * 0.22)
        return out
    if kind == "wobble":
        t = tvec(1.0)
        f = 520 + 140 * np.sin(2 * np.pi * 7 * t)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_adsr(len(t), 0.05, 0.3) * 0.18
    if kind == "poof":
        t = tvec(0.6)
        n = lp(RNG.standard_normal(len(t)), 1800) * np.exp(-t * 7)
        out = n * 0.45
        add(out, kick(0.4), 0)
        return out
    if kind == "whoosh":
        d = 0.75
        t = tvec(d)
        n = RNG.standard_normal(len(t))
        # sweep a band through the noise in short blocks
        out = np.zeros_like(n)
        blk = 1024
        for i in range(0, len(n), blk):
            fc = 400 + 3200 * (i / len(n))
            seg = n[max(0, i - 2048): i + blk]
            y = bp(seg, fc * 0.6, min(fc * 1.6, 20000))
            out[i:i + blk] = y[-len(out[i:i + blk]):]
        return out * np.sin(np.pi * t / d) ** 2 * 0.35
    if kind == "sad_trombone":
        out = np.zeros(int(2.2 * SR))
        notes = [("Bb3", 0.0, 0.32), ("A3", 0.36, 0.32), ("Ab3", 0.72, 0.32), ("G3", 1.08, 0.9)]
        for n, t0, d in notes:
            s = brass(nf(n), d, 0.16)
            if n == "G3":
                tt = tvec(d + 0.1)
                s *= 1 + 0.35 * np.sin(2 * np.pi * 6 * tt)
            add(out, s, t0)
        return out
    if kind == "slide_whistle":
        t = tvec(0.8)
        f = 1500 * (1 - 0.7 * (t / 0.8)) + 25 * np.sin(2 * np.pi * 7 * t)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_adsr(len(t), 0.03, 0.1) * 0.22
    if kind == "tumble":
        out = np.zeros(int(1.3 * SR))
        for k in range(5):
            add(out, kick(0.35), k * 0.24)
            add(out, marimba(nf("C4") * (1 + 0.12 * (k % 2)), 0.1, 0.18), k * 0.24)
        return out
    if kind == "bonk":
        t = tvec(0.35)
        s = (np.sin(2 * np.pi * 820 * t) + 0.6 * np.sin(2 * np.pi * 1340 * t)) * np.exp(-t * 26)
        out = s * 0.35
        add(out, kick(0.5), 0)
        return out
    if kind == "dizzy":
        out = np.zeros(int(1.4 * SR))
        for k in range(8):
            f = [2400, 3000, 2700, 3300][k % 4]
            c = chirp(f, f * 1.15, 0.07) * np.hanning(int(0.07 * SR))
            add(out, c, k * 0.16, 0.12 * (1 - k / 10))
        return out
    if kind == "clap":
        out = np.zeros(int(0.3 * SR))
        add(out, clapsnd(0.7), 0)
        add(out, clapsnd(0.4), 0.012)
        return out
    if kind == "rustle":
        t = tvec(0.7)
        n = bp(RNG.standard_normal(len(t)), 1500, 7000)
        am = np.abs(lp(RNG.standard_normal(len(t)), 30))
        am /= am.max() + 1e-9
        return n * am * np.sin(np.pi * t / 0.7) * 0.4
    if kind == "ding":
        out = np.zeros(int(1.2 * SR))
        for k, n in enumerate(["C6", "E6", "G6", "C7"]):
            add(out, glock(nf(n), 0.32, 0.9), k * 0.07)
        return out
    if kind == "steps":
        dur = params[0] if params else 1.5
        out = np.zeros(int((dur + 0.2) * SR))
        k = 0
        while k * 0.26 < dur:
            f = 260 if k % 2 == 0 else 310
            t = tvec(0.08)
            s = np.sin(2 * np.pi * f * t) * np.exp(-t * 55)
            add(out, s, k * 0.26, 0.25)
            k += 1
        return out
    if kind == "buzz":
        dur = params[0] if params else 2.0
        t = tvec(dur)
        f = 190 + 25 * np.sin(2 * np.pi * 5 * t) + 40 * np.sin(2 * np.pi * 0.9 * t)
        ph = np.cumsum(f) / SR
        saw = 2 * (ph % 1.0) - 1
        s = lp(saw, 1400) * (0.75 + 0.25 * np.sin(2 * np.pi * 11 * t))
        return s * env_adsr(len(t), 0.15, 0.3) * 0.09
    if kind == "pour":
        dur = params[0] if params else 3.0
        t = tvec(dur)
        n = bp(RNG.standard_normal(len(t)), 700, 4500) * 0.12
        out = n * env_adsr(len(t), 0.2, 0.4)
        k = 0.0
        while k < dur - 0.2:
            f = 500 + 900 * RNG.random()
            b = chirp(f, f * 1.7, 0.05) * np.hanning(int(0.05 * SR))
            add(out, b, k, 0.08)
            k += 0.05 + 0.1 * RNG.random()
        return out
    if kind == "grow":
        i = _grow_count[0]; _grow_count[0] += 1
        base = [nf("C5"), nf("D5"), nf("E5"), nf("G5"), nf("A5")][i % 5]
        t = tvec(0.5)
        s = chirp(base * 0.5, base, 0.5, 0.6) * np.exp(-t * 3) * env_adsr(len(t), 0.01, 0.1) * 0.15
        out = np.zeros(int(1.2 * SR))
        add(out, s, 0)
        add(out, glock(base * 2, 0.3), 0.35)
        return out
    if kind == "splash_small":
        t = tvec(0.35)
        n = bp(RNG.standard_normal(len(t)), 1000, 6000) * np.exp(-t * 14) * 0.3
        b = chirp(700, 380, 0.12) * np.exp(-tvec(0.12) * 20) * 0.25
        out = n.copy(); add(out, b, 0.02)
        return out
    if kind == "splash":
        t = tvec(1.3)
        n = lp(RNG.standard_normal(len(t)), 5000) * (np.exp(-t * 4.5)) * 0.55
        out = n.copy()
        add(out, kick(0.7), 0)
        for k in range(7):
            f = 400 + 700 * RNG.random()
            b = chirp(f, f * 1.8, 0.07) * np.hanning(int(0.07 * SR))
            add(out, b, 0.25 + k * 0.11, 0.12)
        return out
    if kind == "ribbit":
        out = np.zeros(int(0.6 * SR))
        for k in range(2):
            t = tvec(0.13)
            car = np.sign(np.sin(2 * np.pi * 210 * t)) * 0.5 + np.sin(2 * np.pi * 420 * t) * 0.5
            am = 0.5 + 0.5 * np.sin(2 * np.pi * 45 * t)
            s = lp(car * am, 1600) * np.hanning(len(t)) * 0.35
            add(out, s, k * 0.2)
        return out
    if kind == "trip":
        t = tvec(0.25)
        s = chirp(600, 1400, 0.25) * env_adsr(len(t), 0.01, 0.05) * 0.2
        out = np.zeros(int(0.7 * SR))
        add(out, s, 0)
        add(out, kick(0.4), 0.3)
        return out
    if kind == "count":
        n = int(params[0]) if params else 1
        out = np.zeros(int(1.0 * SR))
        add(out, sfx("pop"), 0)
        add(out, glock(nf(["C6", "D6", "E6", "F6", "G6"][(n - 1) % 5]), 0.4, 0.9), 0.02)
        return out
    if kind == "squeak":
        out = np.zeros(int(0.4 * SR))
        for k in range(2):
            c = chirp(1700, 2700, 0.07) * np.hanning(int(0.07 * SR))
            add(out, c, k * 0.11, 0.2)
        return out
    if kind == "drumroll":
        dur = params[0] if params else 1.0
        out = np.zeros(int((dur + 0.2) * SR))
        k = 0
        while k / 28 < dur:
            add(out, clapsnd(0.12 + 0.3 * (k / 28) / dur), k / 28)
            k += 1
        return out
    if kind == "magic":
        out = np.zeros(int(3.2 * SR))
        scale = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6", "G6", "A6", "C7", "D7", "E7", "G7"]
        for k, n in enumerate(scale):
            add(out, glock(nf(n), 0.3, 1.0), k * 0.12)
        t = tvec(3.2)
        shimmer = hp(RNG.standard_normal(len(t)), 7000) * np.sin(np.pi * t / 3.2) ** 2 * 0.05
        return out + shimmer
    if kind == "fanfare":
        out = np.zeros(int(1.8 * SR))
        hits = [(0.0, 0.12), (0.16, 0.12), (0.32, 0.12), (0.5, 1.0)]
        chord = ["C4", "E4", "G4", "C5"]
        for t0, d in hits:
            for n in chord:
                add(out, brass(nf(n), d, 0.07), t0)
        return out
    if kind == "finale_chime":
        out = np.zeros(int(2.0 * SR))
        for k, n in enumerate(["C6", "E6", "G6", "C7", "E7"]):
            add(out, glock(nf(n), 0.3, 1.6), k * 0.09)
        return out
    raise ValueError("unknown sfx " + kind)


# ----------------------------------------------------------------------------- music
PROG = {
    "C": ["C3", ["C4", "E4", "G4", "C5"]],
    "G": ["G2", ["B3", "D4", "G4", "B4"]],
    "Am": ["A2", ["A3", "C4", "E4", "A4"]],
    "F": ["F2", ["A3", "C4", "F4", "A4"]],
    "Dm": ["D3", ["A3", "D4", "F4", "A4"]],
}
# melody bars: list of (beat, note, beats)
MEL = {
    "A1": [(0, "E5", .5), (.5, "G5", .5), (1, "A5", .5), (1.5, "G5", .5), (2, "E5", 1), (3, "C5", 1)],
    "A2": [(0, "D5", .5), (.5, "E5", .5), (1, "D5", .5), (1.5, "B4", .5), (2, "G4", 2)],
    "A3": [(0, "A4", .5), (.5, "C5", .5), (1, "E5", .5), (1.5, "C5", .5), (2, "A4", 1), (3, "E5", 1)],
    "A4": [(0, "F5", .5), (.5, "E5", .5), (1, "D5", .5), (1.5, "C5", .5), (2, "D5", 2)],
    "B1": [(0, "G5", .5), (.5, "E5", .5), (1, "C5", .5), (1.5, "E5", .5), (2, "G5", 1), (3, "C6", 1)],
    "B2": [(0, "A5", .5), (.5, "G5", .5), (1, "F5", .5), (1.5, "A5", .5), (2, "C6", 1), (3, "A5", 1)],
    "B3": [(0, "G5", .5), (.5, "F5", .5), (1, "E5", .5), (1.5, "D5", .5), (2, "B4", 1), (3, "D5", 1)],
    "B4": [(0, "C5", 1), (1, "E5", .5), (1.5, "G5", .5), (2, "C6", 2)],
    "W1": [(0, "C5", .5), (.5, "C5", .5), (1, "D5", .5), (1.5, "E5", .5), (2, "G5", .5), (2.5, "E5", .5), (3, "D5", 1)],
    "W2": [(0, "B4", .5), (.5, "D5", .5), (1, "G5", .5), (1.5, "F5", .5), (2, "E5", .5), (2.5, "D5", .5), (3, "B4", 1)],
}


def build_bars():
    """60 bars of 2 s (120 BPM, 4/4). Each bar: chord, melody id, drums?, energy."""
    bars = []
    A = [("C", "A1"), ("G", "A2"), ("Am", "A3"), ("F", "A4")]
    B = [("C", "B1"), ("F", "B2"), ("G", "B3"), ("C", "B4")]
    # scene 1 (bars 0-9)
    bars += [dict(ch="C", mel=None, drums=0, arp=True, en=0.6), dict(ch="C", mel=None, drums=0, arp=True, en=0.6)]
    bars += [dict(ch=c, mel=m, drums=0, en=0.75) for c, m in A]
    bars += [dict(ch="Am", mel=None, drums=0, en=0.45), dict(ch="F", mel=None, drums=0, en=0.45)]
    bars += [dict(ch="G", mel="W2", drums=1, en=0.9), dict(ch="C", mel="W1", drums=1, en=0.9)]
    # scenes 2..5 (bars 10-49): groove
    for i in range(10):
        cyc = A if i % 2 == 0 else B
        for c, m in cyc:
            bars.append(dict(ch=c, mel=m, drums=1, en=1.0))
    # scene 6 (bars 50-59)
    bars += [dict(ch=c, mel=m, drums=1, en=1.0) for c, m in A]          # 100-108
    bars += [dict(ch="G", mel=None, drums=0, en=0.7, hold=True)]        # 108-110 build
    bars += [dict(ch=c, mel=m, drums=2, en=1.1) for c, m in B]          # 110-118 finale
    bars += [dict(ch="C", mel=None, drums=0, en=1.0, final=True)]       # 118-120
    assert len(bars) == 60, len(bars)
    return bars


def build_music(total):
    mus_chords = np.zeros(total)
    mus_mel = np.zeros(total)
    mus_drums = np.zeros(total)
    beat = 0.5
    for b, bar in enumerate(build_bars()):
        t0 = b * 2.0
        root, notes = PROG[bar["ch"]]
        en = bar["en"]
        if bar.get("final"):
            for k, n in enumerate(notes):
                add(mus_chords, pluck(nf(n), 1.8, 0.35), t0 + k * 0.03)
            add(mus_chords, bass(nf(root), 1.9, 0.6), t0)
            continue
        if bar.get("hold"):
            for k in range(8):  # gentle rising strum
                for j, n in enumerate(notes):
                    add(mus_chords, pluck(nf(n), 0.25, 0.12 + 0.03 * k), t0 + k * 0.25 + j * 0.012)
            add(mus_chords, bass(nf(root), 1.9, 0.5), t0)
            continue
        # bass: beats 1 and 3 (+ walk on 4& when drums)
        add(mus_chords, bass(nf(root), 0.9, 0.55 * en), t0)
        fifth = nf(root) * 1.5
        add(mus_chords, bass(fifth, 0.9, 0.45 * en), t0 + 2 * beat)
        # ukulele-style strum: 1, 2&, 3&, 4
        for k, (bt, a) in enumerate([(0, 0.32), (1.5, 0.22), (2.5, 0.22), (3, 0.26)]):
            for j, n in enumerate(notes):
                add(mus_chords, pluck(nf(n), 0.35, a * en), t0 + bt * beat + j * 0.011)
        if bar.get("arp"):
            for k, n in enumerate(["C5", "E5", "G5", "C6", "E6", "G6", "C6", "G5"]):
                add(mus_mel, glock(nf(n), 0.22), t0 + k * 0.25)
        if bar["mel"]:
            for bt, n, ln in MEL[bar["mel"]]:
                add(mus_mel, marimba(nf(n), ln * beat, 0.42 * en), t0 + bt * beat)
                if bar["drums"] == 2:  # finale: double with glockenspiel
                    add(mus_mel, glock(nf(n) * 2, 0.12, 0.6), t0 + bt * beat)
        if bar["drums"]:
            for k in range(4):
                add(mus_drums, kick(0.55 if k % 2 == 0 else 0.3), t0 + k * beat)
            for k in range(8):
                add(mus_drums, shaker(0.18 if k % 2 else 0.1), t0 + k * beat / 2 * 1)
            if bar["drums"] == 2:
                add(mus_drums, clapsnd(0.25), t0 + 1 * beat)
                add(mus_drums, clapsnd(0.25), t0 + 3 * beat)
    return mus_chords, mus_mel, mus_drums


# ----------------------------------------------------------------------------- voices
def read_wav(path):
    with wave.open(path) as w:
        sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
        a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    if ch == 2:
        a = a.reshape(-1, 2).mean(1)
    assert sr == SR, sr
    return a


def write_wav(path, a, stereo=False):
    a = np.clip(a, -1, 1)
    if stereo and a.ndim == 1:
        a = np.stack([a, a], 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2 if a.ndim == 2 else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


_voice_cache = {}


def tts(text, vcfg, voices_dir, cache_dir):
    from piper import PiperVoice, SynthesisConfig
    key = hashlib.sha1(json.dumps([text, vcfg], sort_keys=True).encode()).hexdigest()[:16]
    out = os.path.join(cache_dir, key + ".wav")
    if not os.path.exists(out):
        model = vcfg["model"]
        if model not in _voice_cache:
            _voice_cache[model] = PiperVoice.load(os.path.join(voices_dir, model + ".onnx"))
        v = _voice_cache[model]
        cfg = SynthesisConfig(speaker_id=vcfg.get("speaker", 0) if v.config.num_speakers > 1 else None,
                              length_scale=vcfg.get("length", 1.0), noise_scale=0.6, noise_w_scale=0.75)
        raw = os.path.join(cache_dir, key + ".raw.wav")
        with wave.open(raw, "wb") as w:
            v.synthesize_wav(text, w, syn_config=cfg)
        p = 2 ** (vcfg.get("semitones", 0) / 12)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af",
                        f"rubberband=pitch={p:.5f}:formant=shifted,aresample={SR},"
                        "highpass=f=90,acompressor=threshold=0.2:ratio=3:attack=5:release=80",
                        "-ac", "1", out], check=True)
        os.remove(raw)
    a = read_wav(out)
    # trim silence
    thr = 0.02
    idx = np.where(np.abs(a) > thr)[0]
    if len(idx):
        a = a[max(0, idx[0] - int(0.02 * SR)): idx[-1] + int(0.06 * SR)]
    a = a / (np.max(np.abs(a)) + 1e-9) * 0.85 * vcfg.get("gain", 1.0)
    return a


def lipsync_env(a, fps):
    hop = SR / fps
    n = int(math.ceil(len(a) / hop))
    rms = np.array([np.sqrt(np.mean(a[int(i * hop): int((i + 1) * hop)] ** 2) + 1e-12) for i in range(n)])
    ref = np.percentile(rms, 90) + 1e-9
    e = np.clip(rms / ref, 0, 1)
    e = np.where(e < 0.12, 0, e)
    return "".join(str(int(round(x * 9))) for x in e)


def fmt_srt(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voices", default=os.environ.get("PIPER_VOICES", os.path.join(ROOT, "build", "voices")),
                    help="folder with en_US-amy-medium.onnx and en_US-libritts_r-medium.onnx (+ .json)")
    args = ap.parse_args()

    story = json.load(open(os.path.join(ROOT, "story", "story.json")))
    D, fps = story["duration"], story["fps"]
    total = int(D * SR)
    cache = os.path.join(ROOT, "build", "tts-cache")
    os.makedirs(cache, exist_ok=True)
    for d in ("audio", "subtitles", "src"):
        os.makedirs(os.path.join(ROOT, d), exist_ok=True)

    # ---- voices
    voice_bus = np.zeros(total)
    lines_out = []
    print("Synthesizing dialogue ...")
    for ln in story["lines"]:
        who = ln["who"]
        members = story["groups"].get(who, [who])
        parts = []
        for k, m in enumerate(members):
            a = tts(ln["text"], story["voices"][m], args.voices, cache)
            parts.append((a, k * 0.018))
        L = max(len(a) + int(o * SR) for a, o in parts)
        mix = np.zeros(L)
        for a, o in parts:
            add(mix, a, o, 1.0 / math.sqrt(len(parts)))
        mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.85
        add(voice_bus, mix, ln["t"])
        dur = len(mix) / SR
        lines_out.append(dict(id=ln["id"], who=who, members=members, name=story["names"][who],
                              text=ln["text"], t=ln["t"], dur=round(dur, 3), env=lipsync_env(mix, fps)))
        print(f"  {ln['t']:6.2f}-{ln['t'] + dur:6.2f}  {who:9s} {ln['text']}")

    # overlap / bounds check
    ok = True
    for a, b in zip(lines_out, lines_out[1:]):
        if a["t"] + a["dur"] > b["t"] - 0.05:
            print(f"  !! overlap: '{a['id']}' ends {a['t'] + a['dur']:.2f} > '{b['id']}' starts {b['t']:.2f}")
            ok = False
    for a in lines_out:
        sc_end = (int(a["t"] // 20) + 1) * 20
        if a["t"] + a["dur"] > sc_end:
            print(f"  !! '{a['id']}' runs past scene end ({a['t'] + a['dur']:.2f} > {sc_end})")
            ok = False

    # ---- sfx
    print("Synthesizing sound effects ...")
    sfx_bus = np.zeros(total)
    for cue in story["sfx"]:
        kind, t0, *params = cue
        add(sfx_bus, sfx(kind, *params), t0)

    # ---- music
    print("Composing music ...")
    chords, mel, drums = build_music(total)

    # ducking: smooth voice envelope
    venv = np.abs(voice_bus)
    venv = lp(venv, 4, 1)
    venv = np.clip(venv / 0.12, 0, 1)
    duck_mel = 1 - 0.8 * venv
    duck_all = 1 - 0.5 * venv
    music = (chords * 0.42 + drums * 0.35) * duck_all + mel * 0.5 * duck_mel
    # fades
    t = np.arange(total) / SR
    music *= np.clip(t / 0.3, 0, 1) * np.clip((D - t) / 1.6, 0, 1)

    # ---- stereo mix
    left = music * 0.95 + sfx_bus * 0.75 + voice_bus * 1.0
    right = music * 0.95 + sfx_bus * 0.75 + voice_bus * 1.0
    # tiny stereo width on the melody / chords
    left += chords * 0.04
    right += mel * 0.04
    st = np.stack([left, right], 1)
    st = np.tanh(st * 1.15) / np.tanh(1.15)
    st = st / (np.max(np.abs(st)) + 1e-9) * 0.93
    st *= 0.7  # about -14 LUFS integrated: comfortable level for young listeners
    sp = venv > 0.5
    rv = np.sqrt(np.mean(voice_bus[sp] ** 2)); rm = np.sqrt(np.mean((music[sp]) ** 2))
    print(f"  voice-over-music during dialogue: {20 * np.log10(rv / (rm + 1e-9)):.1f} dB")

    wav = os.path.join(ROOT, "audio", "soundtrack.wav")
    write_wav(wav, st)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "160k",
                    os.path.join(ROOT, "audio", "soundtrack.mp3")], check=True)

    # ---- timeline.js
    tl = dict(title=story["title"], duration=D, fps=fps, lines=lines_out,
              sfx=[c[:2] for c in story["sfx"]])
    with open(os.path.join(ROOT, "src", "timeline.js"), "w") as f:
        f.write("// AUTO-GENERATED by tools/build_audio.py - do not edit by hand.\n")
        f.write("window.TIMELINE = " + json.dumps(tl, separators=(",", ":")) + ";\n")

    # ---- SRT
    with open(os.path.join(ROOT, "subtitles", "bunny-and-the-magic-rainbow.srt"), "w") as f:
        for i, a in enumerate(lines_out, 1):
            end = a["t"] + max(a["dur"] + 0.35, 1.0)
            f.write(f"{i}\n{fmt_srt(a['t'])} --> {fmt_srt(end)}\n{a['name']}: {a['text']}\n\n")

    print("Done:", "OK" if ok else "with timing warnings (see above)")


if __name__ == "__main__":
    main()
