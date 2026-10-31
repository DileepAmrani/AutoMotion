import * as fs from "fs";
import axios from "axios";
import * as dotenv from "dotenv";
import { AUDIO_DIR, VIDEOS_JSON, audioPath, ensureDir } from "./paths";

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// This is the default ID for "Adam" - a deep, authoritative American male voice.
// You can fetch other Voice IDs by hitting the ElevenLabs /v1/voices endpoint.
const VOICE_ID = "pNInz6obpgDQGcFmaJgB";

async function generateVoiceovers() {
    const rawData = fs.readFileSync(VIDEOS_JSON, "utf-8");
    const videos = JSON.parse(rawData);

    ensureDir(AUDIO_DIR);

    for (const video of videos) {
        // Concatenate the script pieces with natural pauses (...)
        const textToSpeak = `${video.hook} ... ${video.body} ... ${video.cta}`;
        console.log(`Generating audio for ${video.id}: ${video.topic}...`);

        try {
            const response = await axios({
                method: "POST",
                url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
                headers: {
                    Accept: "audio/mpeg",
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                data: {
                    text: textToSpeak,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                },
                responseType: "arraybuffer",
            });

            const fileName = audioPath(video.id);
            fs.writeFileSync(fileName, response.data);
            console.log(`✅ Saved ${fileName}`);
        } catch (error) {
            console.error(`❌ Error generating audio for ${video.id}`, error);
        }
    }
}

generateVoiceovers();
