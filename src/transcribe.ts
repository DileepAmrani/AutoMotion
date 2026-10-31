import * as fs from "fs";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import { CAPTIONS_DIR, VIDEOS_JSON, audioPath, captionsPath, ensureDir } from "./paths";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function generateSubtitles() {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("your_openai")) {
        console.error("Set OPENAI_API_KEY in .env before running transcription.");
        process.exit(1);
    }

    const rawData = fs.readFileSync(VIDEOS_JSON, "utf-8");
    const videos = JSON.parse(rawData);

    ensureDir(CAPTIONS_DIR);

    for (const video of videos) {
        const audioFile = audioPath(video.id);
        const srtFile = captionsPath(video.id);

        if (!fs.existsSync(audioFile)) {
            console.log(`Skipping ${video.id}: Audio file not found at ${audioFile}`);
            continue;
        }

        console.log(`Transcribing audio for ${video.id}...`);

        try {
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioFile),
                model: "whisper-1",
                response_format: "srt", // Forces the API to return timestamped subtitles
            });

            // The response is plain text in SRT format
            fs.writeFileSync(srtFile, transcription as unknown as string);
            console.log(`✅ Saved subtitles to ${srtFile}`);
        } catch (error) {
            console.error(`❌ Error transcribing ${video.id}:`, error);
        }
    }
}

generateSubtitles();
