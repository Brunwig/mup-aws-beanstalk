"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadEnvFile = void 0;
const fs_1 = __importDefault(require("fs"));
const aws_1 = require("./aws");
const lib_storage_1 = require("@aws-sdk/lib-storage");
async function upload(bucket, key, bundlePath) {
    const fileStream = fs_1.default.createReadStream(bundlePath);
    fileStream.on('error', (err) => {
        console.log(err);
    });
    const params = {
        Bucket: bucket,
        Key: key,
        Body: fileStream,
    };
    const uploader = new lib_storage_1.Upload({
        client: aws_1.s3,
        params,
    });
    let lastPercentage = -1;
    uploader.on('httpUploadProgress', (progress) => {
        const percentage = Math.floor((progress.loaded || 0) / (progress.total || 0) * 100);
        if (percentage !== lastPercentage) {
            console.log(`  Uploaded ${percentage}%`);
            if (percentage === 100) {
                console.log('  Finishing upload. This could take a couple minutes');
            }
        }
        lastPercentage = percentage;
    });
    await uploader.done();
}
exports.default = upload;
async function uploadEnvFile(bucket, version, content) {
    await aws_1.s3.putObject({
        Bucket: bucket,
        Body: content,
        Key: `env/${version}.txt`
    });
}
exports.uploadEnvFile = uploadEnvFile;
//# sourceMappingURL=upload.js.map