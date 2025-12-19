"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const storage_1 = require("@google-cloud/storage");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
const storage = new storage_1.Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'sanbou-ai-transcripts-ap1';
router.post('/signed-url', async (req, res) => {
    try {
        const { fileName, fileType } = req.body;
        if (!fileName) {
            res.status(400).json({ error: 'fileName is required' });
            return;
        }
        const uniqueFileName = `${Date.now()}-${(0, uuid_1.v4)()}-${fileName}`;
        const file = storage.bucket(BUCKET_NAME).file(uniqueFileName);
        const options = {
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000,
            contentType: fileType || 'application/octet-stream',
        };
        const [url] = await file.getSignedUrl(options);
        console.log(`🔑 Signed URL generated for: ${uniqueFileName}`);
        res.json({
            uploadUrl: url,
            storagePath: `gs://${BUCKET_NAME}/${uniqueFileName}`,
            fileName: uniqueFileName
        });
    }
    catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({ error: 'Failed to generate upload URL' });
    }
});
exports.default = router;
