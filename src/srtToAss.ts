import * as fs from "fs";

/** Convert SRT → ASS with PlayRes locked to 9:16 Reels, middle-center safe-zone style. */
export function srtToAss(srtContent: string): string {
    const cueRegex =
        /\d+\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+([\s\S]*?)(?=\n\d+\s+\d{2}:|\n*$)/g;

    const dialogues: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = cueRegex.exec(srtContent)) !== null) {
        const start = `${match[1]}:${match[2]}:${match[3]}.${match[4]!.slice(0, 2)}`;
        const end = `${match[5]}:${match[6]}:${match[7]}.${match[8]!.slice(0, 2)}`;
        const text = match[9]!
            .trim()
            .replace(/\r/g, "")
            .replace(/\n+/g, " ")
            .replace(/[{}\\]/g, "");

        // Keep burn-in captions short: max ~28 chars / ~4 words per on-screen line
        const wrapped = wrapCaption(text, 28);
        dialogues.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${wrapped}`);
    }

    return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,42,&H0000FFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,130,210,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogues.join("\n")}
`;
}

function wrapCaption(text: string, maxChars: number): string {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxChars && current) {
            lines.push(current);
            current = word;
        } else {
            current = next;
        }
    }
    if (current) {
        lines.push(current);
    }

    // At most 2 lines on screen for Reels safe-zone height
    return lines.slice(0, 2).join("\\N");
}

export function writeAssFromSrt(srtPath: string, assPath: string) {
    const srt = fs.readFileSync(srtPath, "utf-8");
    fs.writeFileSync(assPath, srtToAss(srt));
}
