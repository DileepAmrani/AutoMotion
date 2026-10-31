import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import {
    BACKGROUND_VIDEO,
    OUTPUT_DIR,
    ROOT,
    VIDEOS_JSON,
    assPath,
    audioPath,
    captionsPath,
    ensureDir,
    finalVideoPath,
} from "./paths";
import { writeAssFromSrt } from "./srtToAss";

function subtitleFilter(id: string) {
    const assFile = assPath(id);
    const assRel = path.relative(ROOT, assFile).replace(/\\/g, "/");
    // ASS already encodes PlayRes + safe-zone style; escape path for ffmpeg
    return `ass=${assRel}`;
}

async function assembleVideos() {
    const rawData = fs.readFileSync(VIDEOS_JSON, "utf-8");
    const videos = JSON.parse(rawData);

    ensureDir(OUTPUT_DIR);

    for (const video of videos) {
        const audioFile = audioPath(video.id);
        const srtFile = captionsPath(video.id);
        const assFile = assPath(video.id);
        const outputFile = finalVideoPath(video.id);

        if (!fs.existsSync(audioFile) || !fs.existsSync(BACKGROUND_VIDEO)) {
            console.error(`Skipping ${video.id}: Missing ${audioFile} or ${BACKGROUND_VIDEO}`);
            continue;
        }

        if (!fs.existsSync(srtFile)) {
            console.error(`Skipping ${video.id}: Missing captions at ${srtFile}. Run npm run transcribe first.`);
            continue;
        }

        writeAssFromSrt(srtFile, assFile);
        console.log(`Assembling video for ${video.id} (burning captions)...`);

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(BACKGROUND_VIDEO)
                .inputOptions(["-stream_loop", "-1"])
                .input(audioFile)
                .outputOptions([
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-shortest",
                    "-vf", subtitleFilter(video.id),
                ])
                .save(outputFile)
                .on("end", () => {
                    console.log(`✅ Saved ${outputFile}`);
                    resolve(true);
                })
                .on("error", (err: Error) => {
                    console.error(`❌ FFmpeg Error on ${video.id}:`, err.message);
                    reject(err);
                });
        });
    }
}

assembleVideos();
