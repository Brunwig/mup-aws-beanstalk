"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopLogStreamListener = exports.startLogStreamListener = void 0;
const uniq_1 = __importDefault(require("lodash/uniq"));
const aws_1 = require("./aws");
const utils_1 = require("./utils");
let instanceFinderInterval;
let activeInstanceListeners = {};
async function listen(logGroupName, logStreamName, nextToken) {
    const params = {
        logGroupName,
        logStreamName,
    };
    if (nextToken) {
        params.nextToken = nextToken;
    }
    try {
        const { events, nextForwardToken } = await aws_1.logs.getLogEvents(params);
        events.forEach(event => {
            (0, utils_1.logStreamEvent)(`<${logStreamName}> ${event.message}`);
        });
        if (events && events.length > 0 || nextToken) {
            return nextForwardToken;
        }
        return nextToken;
    }
    catch (err) {
        // @ts-ignore
        if (err && err.name === "ResourceNotFoundException") {
            // Log stream is not yet available, takes a little time
            // console.error("Unable to find log stream", logGroupName, logStreamName);
            // const { logStreams } = await logs.describeLogStreams({
            //   logGroupName,
            // });
            // if (logStreams && logStreams.length > 0) {
            //   console.log("Available log streams", logStreams.map(stream => stream.logStreamName));
            // }
            return nextToken;
        }
        console.error("Error", err);
        return nextToken;
    }
}
// Cheeky function that uses the dynamically updated event log (provided by
// the `showEvents` function) to find the instances that were created during
// the deployment.
function getInstancesFromLogs(eventLog) {
    const instances = [];
    eventLog.forEach(event => {
        var _a;
        const match = (_a = event.Message) === null || _a === void 0 ? void 0 : _a.match(/EC2 instance\(s\) \[(.*)\]/);
        if (match) {
            const newInstances = match[1].split(', ');
            newInstances.forEach(instance => {
                instances.push(instance.trim());
            });
        }
    });
    return (0, uniq_1.default)(instances);
}
async function startInstanceLogListener(logGroupName, instanceName) {
    const logStreamName = instanceName;
    try {
        console.log(`Started listening to ${logGroupName}:${instanceName}`);
        let nextToken = await listen(logGroupName, logStreamName);
        return setInterval(async () => {
            nextToken = await listen(logGroupName, logStreamName, nextToken);
        }, 5000);
    }
    catch (err) {
        // @ts-ignore
        if (err.name === "ResourceNotFoundException") {
            console.error("Unable to find log streams for", logGroupName);
        }
        else {
            console.error("Log stream error", err);
        }
        return;
    }
}
async function startInstanceListeners(logGroupName, instanceNames) {
    instanceNames.forEach(async (instanceName) => {
        if (activeInstanceListeners[instanceName]) {
            return;
        }
        const instanceListener = await startInstanceLogListener(logGroupName, instanceName);
        if (instanceListener) {
            activeInstanceListeners[instanceName] = instanceListener;
        }
    });
}
async function startLogStreamListener(api, eventLog) {
    const config = api.getConfig();
    console.log("Start log stream listener");
    const { environment } = (0, utils_1.names)(config);
    const logFileName = 'var/log/web.stdout.log';
    const logGroupName = `/aws/elasticbeanstalk/${environment}/${logFileName}`;
    await startInstanceListeners(logGroupName, getInstancesFromLogs(eventLog));
    instanceFinderInterval = setInterval(async () => {
        await startInstanceListeners(logGroupName, getInstancesFromLogs(eventLog));
    }, 5000);
}
exports.startLogStreamListener = startLogStreamListener;
async function stopLogStreamListener() {
    clearInterval(instanceFinderInterval);
    Object.values(activeInstanceListeners).forEach(listener => {
        clearInterval(listener);
    });
}
exports.stopLogStreamListener = stopLogStreamListener;
//# sourceMappingURL=deployment-logs.js.map