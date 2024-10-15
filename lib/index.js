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
exports.hooks = exports.validate = exports.commands = exports.description = exports.name = void 0;
exports.prepareConfig = prepareConfig;
const _commands = __importStar(require("./commands"));
const validate_1 = __importDefault(require("./validate"));
exports.name = 'beanstalk';
exports.description = 'Deploy Meteor app to AWS Elastic Beanstalk';
exports.commands = _commands;
exports.validate = {
    app(config, utils) {
        if (config.app && config.app.type === 'aws-beanstalk') {
            return (0, validate_1.default)(config, utils);
        }
        return [];
    }
};
function prepareConfig(config) {
    if (!config.app || config.app.type !== 'aws-beanstalk') {
        return config;
    }
    console.log('Preparing config for AWS Elastic Beanstalk');
    const defaultBuildOptions = {
        serverOnly: true
    };
    config.app.buildOptions = config.app.buildOptions || defaultBuildOptions;
    // This will change 0 to 1. The validator will warn when the number is 0
    // To have 0 instances, `mup stop` should be used
    config.app.minInstances = config.app.minInstances || 1;
    config.app.maxInstances = config.app.maxInstances || config.app.minInstances;
    config.app.instanceType = config.app.instanceType || 't2.micro';
    config.app.envType = config.app.envType || 'webserver';
    config.app.env = config.app.env || {};
    config.app.env.PORT = 8081;
    config.app.env.METEOR_SIGTERM_GRACE_PERIOD_SECONDS = 30;
    config.app.oldVersions = config.app.oldVersions || 3;
    return config;
}
function isBeanstalkApp(api) {
    const config = api.getConfig();
    if (config.app && config.app.type === 'aws-beanstalk') {
        return true;
    }
    return false;
}
exports.hooks = {
    'post.setup': (api) => {
        if (isBeanstalkApp(api)) {
            return api.runCommand('beanstalk.setup');
        }
    },
    'post.deploy': (api) => {
        if (isBeanstalkApp(api)) {
            return api.runCommand('beanstalk.deploy');
        }
    },
    'post.logs': (api) => {
        if (isBeanstalkApp(api)) {
            return api.runCommand('beanstalk.logs');
        }
    },
    'post.start': (api) => {
        if (isBeanstalkApp(api)) {
            return api.runCommand('beanstalk.start');
        }
    },
    'post.stop': (api) => {
        if (isBeanstalkApp(api)) {
            return api.runCommand('beanstalk.stop');
        }
    },
    'post.restart': (api) => {
        if (isBeanstalkApp(api)) {
            return api.runCommand('beanstalk.restart');
        }
    },
    'post.reconfig': (api) => {
        if (isBeanstalkApp(api)) {
            return api.runCommand('beanstalk.reconfig');
        }
    },
    'post.status': (api) => {
        if (isBeanstalkApp(api)) {
            return api.runCommand('beanstalk.status');
        }
    }
};
//# sourceMappingURL=index.js.map