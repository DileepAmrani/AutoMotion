import * as fs from "fs";
import * as path from "path";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const AUDIO_DIR = path.join(ROOT, "audio");
export const ASSETS_DIR = path.join(ROOT, "assets");
export const CAPTIONS_DIR = path.join(ROOT, "captions");
export const OUTPUT_DIR = path.join(ROOT, "output");

export const VIDEOS_JSON = path.join(DATA_DIR, "videos.json");
export const BACKGROUND_VIDEO = path.join(ASSETS_DIR, "background.mp4");

export function audioPath(id: string) {
    return path.join(AUDIO_DIR, `audio_${id}.mp3`);
}

export function captionsPath(id: string) {
    return path.join(CAPTIONS_DIR, `captions_${id}.srt`);
}

export function assPath(id: string) {
    return path.join(CAPTIONS_DIR, `captions_${id}.ass`);
}

export function finalVideoPath(id: string) {
    return path.join(OUTPUT_DIR, `final_${id}.mp4`);
}

export function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
