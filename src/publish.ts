import * as fs from "fs";
import axios from "axios";
import * as dotenv from "dotenv";
import { DATA_DIR, VIDEOS_JSON, ensureDir, finalVideoPath } from "./paths";

dotenv.config();

const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const API_VERSION = "v26.0";
const PUBLISHED_JSON = `${DATA_DIR}/published.json`;

type VideoScript = {
    id: string;
    topic: string;
    hook: string;
    body: string;
    cta: string;
    facebookCaption: string;
};

type PublishedVideo = VideoScript & { publishedAt: string };

function loadQueue(): VideoScript[] {
    if (!fs.existsSync(VIDEOS_JSON)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(VIDEOS_JSON, "utf-8"));
}

function saveQueue(videos: VideoScript[]) {
    ensureDir(DATA_DIR);
    fs.writeFileSync(VIDEOS_JSON, JSON.stringify(videos, null, 2));
}

function archivePublished(video: VideoScript) {
    ensureDir(DATA_DIR);
    const existing: PublishedVideo[] = fs.existsSync(PUBLISHED_JSON)
        ? JSON.parse(fs.readFileSync(PUBLISHED_JSON, "utf-8"))
        : [];
    existing.push({ ...video, publishedAt: new Date().toISOString() });
    fs.writeFileSync(PUBLISHED_JSON, JSON.stringify(existing, null, 2));
}

async function uploadReelToFacebook(videoId: string, filePath: string, description: string) {
    if (!PAGE_ID || !ACCESS_TOKEN || ACCESS_TOKEN.includes("your_page_access_token")) {
        throw new Error("Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN in .env before publishing.");
    }

    console.log(`Starting upload process for ${videoId}...`);

    // STEP 1: Initialize Upload Session
    const initUrl = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/video_reels`;
    const initResponse = await axios.post(initUrl, {
        upload_phase: "start",
        access_token: ACCESS_TOKEN,
    });

    const fbVideoId = initResponse.data.video_id;
    const uploadUrl = initResponse.data.upload_url;
    console.log(`Session started. Facebook Video ID: ${fbVideoId}`);

    // STEP 2: Upload the Binary Video Data
    const fileBuffer = fs.readFileSync(filePath);
    const fileSize = fs.statSync(filePath).size;

    await axios.post(uploadUrl, fileBuffer, {
        headers: {
            Authorization: `OAuth ${ACCESS_TOKEN}`,
            offset: "0",
            file_size: fileSize.toString(),
            "Content-Type": "application/octet-stream",
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });
    console.log(`Binary upload complete for ${videoId}.`);

    // STEP 3: Publish the Reel
    const finishUrl = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/video_reels`;
    await axios.post(finishUrl, {
        upload_phase: "finish",
        video_id: fbVideoId,
        video_state: "PUBLISHED",
        description,
        access_token: ACCESS_TOKEN,
    });

    console.log(`✅ Successfully published Reel: ${videoId}`);
}

async function publishNextVideo() {
    const queue = loadQueue();

    if (queue.length === 0) {
        console.log("Queue empty — nothing to publish. Run npm run generate first.");
        return;
    }

    const [next, ...remaining] = queue;
    if (!next) {
        console.log("Queue empty — nothing to publish.");
        return;
    }
    const filePath = finalVideoPath(next.id);

    if (!fs.existsSync(filePath)) {
        console.error(`Skipping ${next.id}: MP4 not found at ${filePath}`);
        return;
    }

    try {
        await uploadReelToFacebook(next.id, filePath, next.facebookCaption);
        archivePublished(next);
        saveQueue(remaining);
        console.log(`Queue updated. ${remaining.length} video(s) remaining.`);
    } catch (error: any) {
        console.error(`❌ Failed to upload ${next.id}:`, error.response?.data || error.message);
        // Leave the video in the queue so the next cron run can retry
    }
}

async function publishAllVideos() {
    while (loadQueue().length > 0) {
        const before = loadQueue().length;
        await publishNextVideo();
        const after = loadQueue().length;

        // Stop if upload failed and queue wasn't reduced
        if (after >= before) {
            break;
        }

        // Wait 10 seconds between uploads to avoid Meta's rate-limiting
        if (after > 0) {
            await new Promise((resolve) => setTimeout(resolve, 10000));
        }
    }
}

const publishAll = process.argv.includes("--all");
if (publishAll) {
    publishAllVideos();
} else {
    // Default: publish one video (cron-friendly, twice daily)
    publishNextVideo();
}
