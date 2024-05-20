"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnvFile = void 0;
const shell_escape_1 = __importDefault(require("shell-escape"));
function createEnvFile(env, settings) {
    let content = '';
    const settingsString = encodeURIComponent(JSON.stringify(settings));
    Object.keys(env).forEach((key) => {
        const value = (0, shell_escape_1.default)([env[key]]);
        content += `export ${key}=${value}\n`;
    });
    content += `export METEOR_SETTINGS_ENCODED=${(0, shell_escape_1.default)([settingsString])}`;
    return content;
}
exports.createEnvFile = createEnvFile;
//# sourceMappingURL=env-settings.js.map