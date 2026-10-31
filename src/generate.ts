import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs"; // Fixed import
import * as dotenv from "dotenv"; // Fixed import
import { DATA_DIR, VIDEOS_JSON, ensureDir } from "./paths";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const TOP_PERFORMERS_JSON = `${DATA_DIR}/top_performers.json`;

function loadPerformanceContext(): string {
    if (!fs.existsSync(TOP_PERFORMERS_JSON)) {
        return "";
    }

    try {
        const payload = JSON.parse(fs.readFileSync(TOP_PERFORMERS_JSON, "utf-8"));
        const top = payload.topPerformers || [];
        if (!top.length) {
            return "";
        }

        return `
Here are my highest-retaining scripts from last week. Generate new scripts utilizing this exact pacing and hook structure:
${JSON.stringify(top, null, 2)}
`;
    } catch {
        return "";
    }
}

// UPDATE 1: Function now returns a Promise of any[] instead of writing to disk
async function generateVideoScripts(batchSize: number, niche: string): Promise<any[]> {
    const model = genAI.getGenerativeModel({
        model: "gemini-3.8-flash",
        generationConfig: { responseMimeType: "application/json" },
    });

    const performanceContext = loadPerformanceContext();

    const prompt = `
    You are an expert short-form video scriptwriter. 
    Generate exactly ${batchSize} highly engaging 60-second video scripts for the niche: "${niche}".
    ${performanceContext}
    
    Structure the output strictly as a JSON array of objects. Do not include markdown formatting or backticks, just the raw JSON.
    Each object must have:
    - "id": A unique string (e.g., "vid_01")
    - "topic": The core subject of the video
    - "hook": The first 3 seconds of text to grab attention
    - "body": The main educational/entertaining text
    - "cta": A polarizing or engaging question for the comments
    - "facebookCaption": A social media caption including hashtags
    `;

    console.log(`Generating ${batchSize} scripts for niche: ${niche}...`);
    if (performanceContext) {
        console.log("Injecting top-performer feedback from data/top_performers.json");
    }

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        const cleanedJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const videosData = JSON.parse(cleanedJson);

        return videosData; // Return the array to the master loop
    } catch (error) {
        console.error(`Error generating scripts for ${niche}:`, error);
        return []; // Return empty array on failure so the script doesn't crash
    }
}

// UPDATE 2: The Master Loop that aggregates the 3 niches
async function runMonthlyBatch() {
    const niches = [
        { name: "Phishing and Cybersecurity Scams", count: 20 },
        { name: "Dark Stoic Motivation and Discipline", count: 20 },
        { name: "Bizarre and Unexplained Nature Facts", count: 20 }
    ];

    let allVideos: any[] = [];

    // Loop through each niche and append the results
    for (const niche of niches) {
        const nicheVideos = await generateVideoScripts(niche.count, niche.name);
        allVideos = allVideos.concat(nicheVideos);
    }

    // Clean up the IDs so they are perfectly sequential from vid_01 to vid_60
    allVideos = allVideos.map((vid, index) => ({
        ...vid,
        id: `vid_${String(index + 1).padStart(2, '0')}`
    }));

    // Write the massive combined payload to your central paths config
    ensureDir(DATA_DIR);
    fs.writeFileSync(VIDEOS_JSON, JSON.stringify(allVideos, null, 2));
    console.log(`✅ Success! ${VIDEOS_JSON} created with ${allVideos.length} total scripts.`);
}

// Execute the batch
runMonthlyBatch();