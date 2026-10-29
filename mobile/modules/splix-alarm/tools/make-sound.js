/**
 * Makes the default alarm tone: android/src/main/res/raw/splix_alarm.ogg.
 *
 *   node tools/make-sound.js            (needs ffmpeg on the PATH for the .ogg)
 *
 * The tone is generated here rather than downloaded, so there is no licence to
 * worry about. It is a rising four-note chime played twice, then a pause; the
 * phone loops it for as long as the alarm rings.
 *
 * To use a different sound, you do not need this script: put your own file at
 * res/raw/splix_alarm.ogg (or .mp3 / .wav, one file with that name) and rebuild.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RATE = 44100;
const LOOP_SECONDS = 2.4;
// E5, G#5, B5, E6: an E major chord climbing an octave.
const NOTES = [659.26, 830.61, 987.77, 1318.51];
const NOTE_GAP = 0.15;
const RUN_STARTS = [0, 0.78];
const NOTE_SECONDS = 0.7;
const ATTACK_SECONDS = 0.004;

// A struck-bell sound: the note, two overtones and one off-pitch partial, each
// dying away at its own speed.
const PARTIALS = [
  { ratio: 1, level: 1, decay: 0.2 },
  { ratio: 2, level: 0.4, decay: 0.11 },
  { ratio: 3, level: 0.16, decay: 0.07 },
  { ratio: 2.76, level: 0.07, decay: 0.05 },
];

const samples = new Float64Array(Math.round(RATE * LOOP_SECONDS));

const strike = (frequency, startSeconds) => {
  const start = Math.round(startSeconds * RATE);
  const length = Math.round(NOTE_SECONDS * RATE);
  for (let i = 0; i < length && start + i < samples.length; i += 1) {
    const t = i / RATE;
    const attack = Math.min(1, t / ATTACK_SECONDS);
    let value = 0;
    for (const { ratio, level, decay } of PARTIALS) {
      value += level * Math.sin(2 * Math.PI * frequency * ratio * t) * Math.exp(-t / decay);
    }
    samples[start + i] += value * attack;
  }
};

for (const runStart of RUN_STARTS) {
  NOTES.forEach((frequency, index) => strike(frequency, runStart + index * NOTE_GAP));
}

// As loud as it goes without clipping; the phone's alarm volume does the rest.
const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const gain = 0.9 / peak;

const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + samples.length * 2, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); // PCM header size
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 2, 28); // bytes per second
wav.writeUInt16LE(2, 32); // bytes per sample
wav.writeUInt16LE(16, 34); // bits per sample
wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((value, index) => {
  wav.writeInt16LE(Math.round(value * gain * 32767), 44 + index * 2);
});

const rawDir = path.join(__dirname, '..', 'android', 'src', 'main', 'res', 'raw');
const wavPath = path.join(os.tmpdir(), 'splix_alarm.wav');
const oggPath = path.join(rawDir, 'splix_alarm.ogg');
fs.mkdirSync(rawDir, { recursive: true });
fs.writeFileSync(wavPath, wav);

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', '5', oggPath]);
fs.unlinkSync(wavPath);
console.log(`Wrote ${oggPath} (${fs.statSync(oggPath).size} bytes, ${LOOP_SECONDS}s loop)`);
