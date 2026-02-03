"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const joi_1 = __importDefault(require("joi"));
const schema = joi_1.default.object().keys({
    name: joi_1.default.string().min(1).required(),
    path: joi_1.default.string().min(1).required(),
    type: joi_1.default.string().required(),
    envName: joi_1.default.string().min(1),
    envType: joi_1.default.string().valid('webserver', 'worker'),
    buildOptions: joi_1.default.object().keys({
        serverOnly: joi_1.default.bool(),
        debug: joi_1.default.bool(),
        buildLocation: joi_1.default.string(),
        mobileSettings: joi_1.default.object(),
        server: joi_1.default.string().uri(),
        allowIncompatibleUpdates: joi_1.default.boolean(),
        executable: joi_1.default.string()
    }),
    // The meteor plugin adds the docker object, which is a bug in mup
    docker: joi_1.default.object(),
    env: joi_1.default.object(),
    auth: joi_1.default.object().keys({
        id: joi_1.default.string(),
        secret: joi_1.default.string(),
        profile: joi_1.default.string()
    }).required(),
    sslDomains: joi_1.default.array().items(joi_1.default.string()),
    forceSSL: joi_1.default.bool(),
    streamLogs: joi_1.default.bool(),
    region: joi_1.default.string(),
    minInstances: joi_1.default.number().min(1).required(),
    maxInstances: joi_1.default.number().min(1),
    instanceType: joi_1.default.string(),
    gracefulShutdown: joi_1.default.bool(),
    longEnvVars: joi_1.default.bool(),
    requireInstanceRole: joi_1.default.bool(),
    yumPackages: joi_1.default.object().pattern(/[/s/S]*/, [joi_1.default.string().allow('')]),
    oldVersions: joi_1.default.number(),
    customBeanstalkConfig: joi_1.default.array().items(joi_1.default.object({
        namespace: joi_1.default.string().trim().required(),
        resource: joi_1.default.string().trim().optional(),
        option: joi_1.default.string().trim().required(),
        value: joi_1.default.string().trim().required()
    })),
    sshKey: {
        privateKey: joi_1.default.string().required(),
        publicKey: joi_1.default.string().required()
    },
    awsPlatformBranchName: joi_1.default.string().min(1).required()
});
function default_1(config, utils) {
    let details = [];
    details = utils.combineErrorDetails(details, schema.validate(config.app, utils.VALIDATE_OPTIONS));
    if (config.app && config.app.name && config.app.name.length < 4) {
        details.push({
            message: 'must have at least 4 characters',
            path: 'name'
        });
    }
    // Validate that either profile or credentials (id and secret) are provided
    if (config.app && config.app.auth) {
        const hasProfile = config.app.auth.profile && config.app.auth.profile.length > 0;
        const hasCredentials = config.app.auth.id &&
            config.app.auth.id.length > 0 &&
            config.app.auth.secret &&
            config.app.auth.secret.length > 0;
        if (!hasProfile && !hasCredentials) {
            details.push({
                message: 'Either auth.profile or auth credentials (id and secret) must be provided',
                path: 'auth'
            });
        }
        // Ensure both id and secret are provided together if one is provided
        if ((config.app.auth.id && !config.app.auth.secret) ||
            (!config.app.auth.id && config.app.auth.secret)) {
            details.push({
                message: 'Both auth.id and auth.secret must be provided together',
                path: 'auth'
            });
        }
    }
    return utils.addLocation(details, 'app');
}
//# sourceMappingURL=validate.js.map