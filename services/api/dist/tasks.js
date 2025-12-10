"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueTranscribeTask = enqueueTranscribeTask;
// services/api/src/tasks.ts
const tasks_1 = require("@google-cloud/tasks");
const REQUIRED_ENVS = [
    "PROJECT_ID",
    "WORKER_URL",
    "TASKS_SA_EMAIL",
];
for (const k of REQUIRED_ENVS) {
    if (!process.env[k]) {
        console.error(`[tasks] Missing env: ${k}`);
        throw new Error(`Missing environment variable in tasks.ts: ${k}`);
    }
}
const PROJECT_ID = process.env.PROJECT_ID;
const WORKER_URL = process.env.WORKER_URL; // e.g. https://<worker>.run.app/tasks/transcribe
const TASKS_SA_EMAIL = process.env.TASKS_SA_EMAIL;
const TASKS_LOCATION = process.env.TASKS_LOCATION ?? "asia-northeast1";
const TASKS_QUEUE = process.env.TASKS_QUEUE ?? "scribe-queue";
const tasksClient = new tasks_1.CloudTasksClient();
async function enqueueTranscribeTask(params) {
    const { jobId, gcsUri, idx, startSec, endSec, retryCount = 0 } = params;
    const parent = tasksClient.queuePath(PROJECT_ID, TASKS_LOCATION, TASKS_QUEUE);
    // Worker は旧フォーマット { jobId, gcsUri, idx, startSec, endSec, retryCount } を受け取る
    const payload = {
        jobId,
        gcsUri,
        idx,
        startSec,
        endSec,
        retryCount,
    };
    // ★ ここがポイント：Buffer をそのまま渡す（ライブラリが base64 エンコードしてくれる）
    const bodyBuffer = Buffer.from(JSON.stringify(payload), "utf8");
    const task = {
        httpRequest: {
            httpMethod: "POST",
            url: WORKER_URL,
            headers: {
                "Content-Type": "application/json",
            },
            body: bodyBuffer,
            oidcToken: {
                serviceAccountEmail: TASKS_SA_EMAIL,
            },
        },
    };
    const [response] = await tasksClient.createTask({
        parent,
        task,
    });
    console.info(`[enqueueTranscribeTask] job=${jobId} idx=${idx} ${startSec}-${endSec}sec -> ${response.name}`);
    return response;
}
