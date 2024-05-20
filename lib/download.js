"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
exports.default = downloadEnvFile;
//# sourceMappingURL=download.js.map