"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = downloadEnvFile;
const aws_1 = require("./aws");
async function downloadEnvFile(bucket, version) {
    const result = await aws_1.s3.getObject({
        Bucket: bucket,
        Key: `env/${version}.txt`
    });
    const bodyStream = result.Body;
    if (!bodyStream) {
        throw new Error('No body in response');
    }
    return bodyStream.transformToString();
}
//# sourceMappingURL=download.js.map