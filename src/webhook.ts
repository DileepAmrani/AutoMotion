import express from "express";
import axios from "axios";
import * as dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.WEBHOOK_PORT || 3333);
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || "automotion_verify";
const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const API_VERSION = "v26.0";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

// Meta webhook verification handshake
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verified");
        res.status(200).send(challenge);
        return;
    }

    res.sendStatus(403);
});

async function craftReply(commentText: string): Promise<string> {
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
    const prompt = `
You reply to Facebook Reel comments for a developer-tools channel.
Write one short, human-sounding reply (1-2 sentences max).
Be helpful, slightly witty, never corporate, never mention that you are an AI.
Comment: """${commentText}"""
`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim().replace(/^["']|["']$/g, "");
}

async function replyToComment(commentId: string, message: string) {
    const url = `https://graph.facebook.com/${API_VERSION}/${commentId}/comments`;
    await axios.post(url, {
        message,
        access_token: ACCESS_TOKEN,
    });
}

app.post("/webhook", async (req, res) => {
    // Acknowledge immediately so Meta doesn't retry
    res.sendStatus(200);

    try {
        const body = req.body;
        if (body.object !== "page") {
            return;
        }

        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field !== "feed") {
                    continue;
                }

                const value = change.value;
                if (value?.item !== "comment" || value?.verb !== "add") {
                    continue;
                }

                // Ignore our own replies
                if (String(value.from?.id) === String(PAGE_ID)) {
                    continue;
                }

                const commentId = value.comment_id || value.id;
                const commentText = value.message;
                if (!commentId || !commentText) {
                    continue;
                }

                console.log(`Comment received (${commentId}): ${commentText}`);
                const reply = await craftReply(commentText);
                await replyToComment(commentId, reply);
                console.log(`✅ Replied: ${reply}`);
            }
        }
    } catch (error: any) {
        console.error("Webhook handling error:", error.response?.data || error.message);
    }
});

app.get("/health", (_req, res) => {
    res.json({ ok: true, pageId: PAGE_ID || null });
});

app.listen(PORT, () => {
    console.log(`Engagement webhook listening on http://localhost:${PORT}/webhook`);
    console.log(`Verify token: ${VERIFY_TOKEN}`);
    console.log(`Expose with: ngrok http ${PORT}`);
});
