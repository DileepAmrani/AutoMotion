import * as fs from "fs";
import axios from "axios";
import * as dotenv from "dotenv";
import { DATA_DIR, ensureDir } from "./paths";

dotenv.config();

const PAGE_ID = process.env.META_PAGE_ID;
const ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const API_VERSION = "v26.0";

const PUBLISHED_JSON = `${DATA_DIR}/published.json`;
const TOP_PERFORMERS_JSON = `${DATA_DIR}/top_performers.json`;
const MONETIZATION_JSON = `${DATA_DIR}/monetization_status.json`;

type PublishedVideo = {
    id: string;
    topic: string;
    hook: string;
    body: string;
    cta: string;
    facebookCaption: string;
    publishedAt?: string;
    facebookVideoId?: string;
};

type ScoredVideo = PublishedVideo & {
    facebookVideoId: string;
    retentionRate: number;
    shares: number;
    views: number;
    score: number;
};

async function listPageVideos(): Promise<Array<{ id: string; description?: string }>> {
    const url = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/video_reels`;
    const response = await axios.get(url, {
        params: {
            fields: "id,description,created_time",
            access_token: ACCESS_TOKEN,
            limit: 25,
        },
    });
    return response.data.data || [];
}

async function fetchInsights(videoId: string) {
    // Common Reel/video insight metrics. Missing metrics fall back to 0.
    const metrics = [
        "total_video_views",
        "total_video_avg_time_watched",
        "total_video_view_total_time",
        "post_video_social_actions",
    ].join(",");

    try {
        const url = `https://graph.facebook.com/${API_VERSION}/${videoId}/video_insights`;
        const response = await axios.get(url, {
            params: {
                metric: metrics,
                access_token: ACCESS_TOKEN,
            },
        });

        const byName: Record<string, number> = {};
        for (const row of response.data.data || []) {
            const value = row.values?.[0]?.value;
            if (typeof value === "number") {
                byName[row.name] = value;
            } else if (value && typeof value === "object") {
                // social actions can be an object of counts
                byName[row.name] = Number(value.share || value.SHARE || 0);
            }
        }

        const views = byName.total_video_views || 0;
        const avgWatched = byName.total_video_avg_time_watched || 0;
        // Approximate retention vs a ~60s target runtime
        const retentionRate = views > 0 ? Math.min(1, avgWatched / 60) : 0;
        const shares = byName.post_video_social_actions || 0;

        return { views, retentionRate, shares };
    } catch {
        return { views: 0, retentionRate: 0, shares: 0 };
    }
}

async function fetchPageGrowth() {
    try {
        const url = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}`;
        const response = await axios.get(url, {
            params: {
                fields: "followers_count,fan_count",
                access_token: ACCESS_TOKEN,
            },
        });
        return {
            followers: response.data.followers_count || response.data.fan_count || 0,
        };
    } catch {
        return { followers: 0 };
    }
}

function loadPublishedScripts(): PublishedVideo[] {
    if (!fs.existsSync(PUBLISHED_JSON)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(PUBLISHED_JSON, "utf-8"));
}

async function runWeeklyMetrics() {
    if (!PAGE_ID || !ACCESS_TOKEN || ACCESS_TOKEN.includes("your_page_access_token")) {
        console.error("Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN in .env first.");
        process.exit(1);
    }

    ensureDir(DATA_DIR);

    const published = loadPublishedScripts();
    const pageVideos = await listPageVideos();
    const scored: ScoredVideo[] = [];

    for (const fbVideo of pageVideos) {
        const insights = await fetchInsights(fbVideo.id);
        const matched =
            published.find((p) => p.facebookVideoId === fbVideo.id) ||
            published.find((p) => fbVideo.description?.includes(p.hook.slice(0, 40)));

        const base: PublishedVideo = matched || {
            id: fbVideo.id,
            topic: "Unknown",
            hook: fbVideo.description?.slice(0, 120) || "",
            body: "",
            cta: "",
            facebookCaption: fbVideo.description || "",
        };

        scored.push({
            ...base,
            facebookVideoId: fbVideo.id,
            retentionRate: insights.retentionRate,
            shares: insights.shares,
            views: insights.views,
            score: insights.retentionRate * 100 + insights.shares * 2 + insights.views * 0.01,
        });
    }

    scored.sort((a, b) => b.score - a.score);
    const top3 = scored.slice(0, 3);

    fs.writeFileSync(
        TOP_PERFORMERS_JSON,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                topPerformers: top3.map(({ id, topic, hook, body, cta, retentionRate, shares, views }) => ({
                    id,
                    topic,
                    hook,
                    body,
                    cta,
                    retentionRate,
                    shares,
                    views,
                })),
            },
            null,
            2,
        ),
    );

    const growth = await fetchPageGrowth();
    const estimatedWatchMinutes = scored.reduce((sum, v) => sum + (v.views * v.retentionRate * 60) / 60, 0);
    const monetizationReady = growth.followers >= 5000 && estimatedWatchMinutes >= 60000;

    fs.writeFileSync(
        MONETIZATION_JSON,
        JSON.stringify(
            {
                checkedAt: new Date().toISOString(),
                followers: growth.followers,
                estimatedWatchMinutes: Math.round(estimatedWatchMinutes),
                thresholds: { followers: 5000, watchMinutes: 60000 },
                monetizationReady,
                action: monetizationReady
                    ? "Thresholds met — submit the Page for Facebook Content Monetization in Meta Business Suite."
                    : "Keep publishing. Re-check weekly until 5,000 followers and 60,000 watch minutes.",
            },
            null,
            2,
        ),
    );

    console.log(`Saved top performers → ${TOP_PERFORMERS_JSON}`);
    console.log(
        top3
            .map(
                (v, i) =>
                    `${i + 1}. ${v.topic || v.id} | retention=${(v.retentionRate * 100).toFixed(1)}% shares=${v.shares} views=${v.views}`,
            )
            .join("\n") || "No video insights returned yet.",
    );
    console.log(
        `Monetization: followers=${growth.followers}, ~watchMinutes=${Math.round(estimatedWatchMinutes)} → ${
            monetizationReady ? "READY" : "NOT YET"
        }`,
    );
}

runWeeklyMetrics();
