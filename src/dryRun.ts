import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import {
    AUDIO_DIR,
    CAPTIONS_DIR,
    OUTPUT_DIR,
    VIDEOS_JSON,
    audioPath,
    captionsPath,
    ensureDir,
    finalVideoPath,
} from "./paths";

type VideoScript = {
    id: string;
    hook: string;
    body: string;
    cta: string;
};

const WORDS_PER_SECOND = 2.4;

function chunkWords(text: string, size = 4): string[] {
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += size) {
        chunks.push(words.slice(i, i + size).join(" "));
    }
    return chunks.filter(Boolean);
}

function toSrtTime(seconds: number): string {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const millis = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function buildSrt(video: VideoScript): string {
    const lines = [
        ...chunkWords(video.hook, 4),
        ...chunkWords(video.body, 4),
        ...chunkWords(video.cta, 4),
    ];

    let cursor = 0;
    return lines
        .map((line, index) => {
            const duration = Math.max(1.1, line.split(" ").length / WORDS_PER_SECOND);
            const start = cursor;
            const end = cursor + duration;
            cursor = end;
            return `${index + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${line}\n`;
        })
        .join("\n");
}

function synthesizeAudio(video: VideoScript) {
    const text = `${video.hook} ... ${video.body} ... ${video.cta}`;
    const aiffPath = path.join(AUDIO_DIR, `audio_${video.id}.aiff`);
    const mp3Path = audioPath(video.id);

    execFileSync("say", ["-r", "180", "-o", aiffPath, text], { stdio: "inherit" });
    execFileSync(
        "ffmpeg",
        ["-y", "-i", aiffPath, "-codec:a", "libmp3lame", "-q:a", "4", mp3Path],
        { stdio: "inherit" },
    );
    fs.unlinkSync(aiffPath);
    console.log(`✅ Dry-run audio: ${mp3Path}`);
}

function writeCaptions(video: VideoScript) {
    const srtPath = captionsPath(video.id);
    fs.writeFileSync(srtPath, buildSrt(video));
    console.log(`✅ Dry-run captions: ${srtPath}`);
}

function extractQaFrame(videoId: string) {
    const mp4 = finalVideoPath(videoId);
    const qaFrame = path.join(OUTPUT_DIR, `qa_${videoId}.jpg`);
    const qaOverlay = path.join(OUTPUT_DIR, `qa_safezone_${videoId}.jpg`);

    // Mid-frame for caption placement check
    execFileSync(
        "ffmpeg",
        ["-y", "-ss", "4", "-i", mp4, "-frames:v", "1", "-update", "1", qaFrame],
        { stdio: "inherit" },
    );

    // Overlay Facebook-ish safe-zone guides (right rail + bottom UI band)
    execFileSync(
        "ffmpeg",
        [
            "-y",
            "-i",
            qaFrame,
            "-vf",
            [
                // right engagement rail (~18% width)
                "drawbox=x=iw*0.82:y=0:w=iw*0.18:h=ih:color=red@0.25:t=fill",
                // bottom caption / page-name band (~22% height)
                "drawbox=x=0:y=ih*0.78:w=iw:h=ih*0.22:color=red@0.25:t=fill",
                // ideal caption box (center, clear of rails)
                "drawbox=x=iw*0.12:y=ih*0.38:w=iw*0.64:h=ih*0.18:color=lime@0.35:t=3",
            ].join(","),
            "-frames:v",
            "1",
            "-update",
            "1",
            qaOverlay,
        ],
        { stdio: "inherit" },
    );

    console.log(`✅ QA frames: ${qaFrame}`);
    console.log(`✅ Safe-zone overlay: ${qaOverlay}`);
}

async function dryRun() {
    ensureDir(AUDIO_DIR);
    ensureDir(CAPTIONS_DIR);
    ensureDir(OUTPUT_DIR);

    const videos: VideoScript[] = JSON.parse(fs.readFileSync(VIDEOS_JSON, "utf-8"));
    // Keep dry-run fast: first video only unless --all
    const selected = process.argv.includes("--all") ? videos : videos.slice(0, 1);

    for (const video of selected) {
        console.log(`\n--- Dry run fixture: ${video.id} ---`);
        synthesizeAudio(video);
        writeCaptions(video);
    }

    console.log("\nAssembling with burned captions...");
    execFileSync("npx", ["tsx", "src/assemble.ts"], { stdio: "inherit" });

    for (const video of selected) {
        if (fs.existsSync(finalVideoPath(video.id))) {
            extractQaFrame(video.id);
        }
    }

    console.log(
        "\nDry run complete. Open output/qa_safezone_*.jpg — yellow captions should sit inside the green box, clear of red UI zones.",
    );
}

dryRun();
