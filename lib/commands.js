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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.awsLogin = exports.debug = exports.shell = exports.status = exports.reconfig = exports.ssl = exports.clean = exports.events = exports.restart = exports.stop = exports.start = exports.logsEb = exports.logsNginx = exports.fullLogs = exports.logs = exports.deploy = exports.setup = void 0;
const commandHandlers = __importStar(require("./command-handlers"));
const aws_1 = __importDefault(require("./aws"));
const validate_1 = require("./validate");
let prepared = false;
function prepare(commandHandler) {
    return async function handler(api) {
        if (!prepared) {
            // Verify AWS account BEFORE configuring AWS SDK
            await (0, validate_1.verifyAwsAccount)(api.getConfig());
            (0, aws_1.default)(api.getConfig().app);
            prepared = true;
        }
        return commandHandler(api);
    };
}
exports.setup = {
    description: 'Prepare AWS to deploy app',
    handler: prepare(commandHandlers.setup)
};
exports.deploy = {
    description: 'Deploy app to AWS Elastic Beanstalk',
    builder(subYargs) {
        return subYargs.option('cached-build', {
            description: 'Use build from previous deploy',
            boolean: true
        });
    },
    handler: commandHandlers.deploy
};
exports.logs = {
    description: 'View app\'s logs',
    builder(yargs) {
        return yargs
            .strict(false)
            .option('tail', {
            description: 'Number of lines to show from the end of the logs',
            alias: 't',
            number: true
        })
            .option('follow', {
            description: 'Follow log output',
            alias: 'f',
            boolean: true
        });
    },
    handler: prepare(commandHandlers.logs)
};
exports.fullLogs = {
    name: 'fullLogs',
    description: 'Download fullLogs',
    handler: prepare(commandHandlers.fullLogs)
};
exports.logsNginx = {
    name: 'logs-nginx',
    description: 'View Nginx logs',
    handler: prepare(commandHandlers.logsNginx)
};
exports.logsEb = {
    name: 'logs-eb',
    description: 'Logs from setting up server and installing npm dependencies',
    handler: prepare(commandHandlers.logsEb)
};
exports.start = {
    description: 'Start app',
    handler: prepare(commandHandlers.start)
};
exports.stop = {
    description: 'Stop app',
    handler: prepare(commandHandlers.stop)
};
exports.restart = {
    description: 'Restart app',
    handler: prepare(commandHandlers.restart)
};
exports.events = {
    description: 'Environment Events',
    handler: prepare(commandHandlers.events)
};
exports.clean = {
    description: 'Remove old bundles and app versions',
    handler: prepare(commandHandlers.clean)
};
exports.ssl = {
    description: 'Setup and view status of ssl certificate',
    handler: prepare(commandHandlers.ssl)
};
exports.reconfig = {
    description: 'Update env variables, instance count, and Meteor settings.json',
    handler: prepare(commandHandlers.reconfig)
};
exports.status = {
    description: 'View status of app',
    handler: prepare(commandHandlers.status)
};
exports.shell = {
    name: 'shell [instance-id]',
    description: 'Open production Meteor shell',
    builder(yargs) {
        yargs.positional('instance-id', {
            description: 'Instance id. If not provided, will show a list of instances'
        }).strict(false);
    },
    handler: prepare(commandHandlers.shell)
};
exports.debug = {
    name: 'debug [instance-id]',
    description: 'Connect your local Node developer tools',
    builder(yargs) {
        yargs.positional('instance-id', {
            description: 'Instance id. If not provided, will show a list of instances'
        }).strict(false);
    },
    handler: prepare(commandHandlers.debug)
};
exports.awsLogin = {
    name: 'login',
    description: 'Login to AWS SSO using the configured profile',
    handler: commandHandlers.awsLogin
};
//# sourceMappingURL=commands.js.map