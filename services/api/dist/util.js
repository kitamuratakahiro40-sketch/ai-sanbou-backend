"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadToTmp = downloadToTmp;
exports.ffprobeDurationSeconds = ffprobeDurationSeconds;
const storage_1 = require("@google-cloud/storage");
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const crypto = __importStar(require("node:crypto"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const storage = new storage_1.Storage();
const TMP = os.tmpdir();
/**
 * downloadToTmp: GCS オブジェクトを一時ファイルにダウンロードしてパスを返す
 */
async function downloadToTmp(gcsUri) {
    if (!gcsUri)
        throw new Error("downloadToTmp: gcsUri is required");
    let bucket;
    let name;
    const m = gcsUri.match(/^(?:gs|gcs):\/\/([^/]+)\/(.+)$/);
    if (m) {
        bucket = m[1];
        name = m[2];
    }
    else {
        const m2 = gcsUri.match(/^([^/]+)\/(.+)$/);
        if (m2) {
            bucket = m2[1];
            name = m2[2];
        }
    }
    if (!bucket || !name) {
        throw new Error(`downloadToTmp: invalid gcsUri: ${gcsUri}`);
    }
    const base = path.basename(name);
    const rand = crypto.randomBytes(6).toString("hex");
    const tmpPath = path.join(TMP, `src-${Date.now()}-${rand}-${base}`);
    try {
        const [exists] = await storage.bucket(bucket).file(name).exists();
        if (!exists)
            throw new Error(`GCS object not found: gs://${bucket}/${name}`);
        await storage.bucket(bucket).file(name).download({ destination: tmpPath });
        return tmpPath;
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error(`downloadToTmp failed for gs://${bucket}/${name}:`, err);
        throw err;
    }
}
/**
 * ffprobe の実行パスを決定する
 * - まず ffprobe-static があればそれを使う（バイナリの絶対パス）
 * - なければ PATH 上の "ffprobe" を使う
 */
let ffprobeExec = "ffprobe";
try {
    // require を使って柔軟にロード（TypeScript の型エラー回避）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffprobeStatic = require("ffprobe-static");
    if (ffprobeStatic) {
        // ffprobe-static は string か { path: string } を返す実装があるため両方対応
        ffprobeExec = (ffprobeStatic.path ?? ffprobeStatic);
    }
}
catch (e) {
    // ffprobe-static が無くても PATH 上の ffprobe を使うためフォールバック
    ffprobeExec = "ffprobe";
}
/**
 * ffprobe を実行してメディア長（秒）を返す
 * - ffprobe が使えない場合やエラー時は 0 を返す（呼び出し側で扱いやすくするため）
 */
async function ffprobeDurationSeconds(filePath) {
    if (!filePath)
        throw new Error("ffprobeDurationSeconds: filePath required");
    try {
        const { stdout } = (await execFileAsync(ffprobeExec, [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            filePath,
        ]));
        const s = stdout?.toString().trim();
        const v = parseFloat(s ?? "");
        if (isNaN(v)) {
            // eslint-disable-next-line no-console
            console.warn("ffprobeDurationSeconds: ffprobe returned non-numeric output", stdout);
            return 0;
        }
        return v;
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.warn("ffprobeDurationSeconds: failed to run ffprobe:", err);
        return 0;
    }
}
