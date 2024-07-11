"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLogStreamListener = startLogStreamListener;
exports.stopLogStreamListener = stopLogStreamListener;
const uniq_1 = __importDefault(require("lodash/uniq"));
const aws_1 = require("./aws");
const utils_1 = require("./utils");
let instanceFinderInterval = {};
let activeInstanceListeners = {};
let stopped = false;
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
    if (stopped)
        return;
    const logStreamName = instanceName;
    try {
        let nextToken = await listen(logGroupName, logStreamName);
        return setInterval(async () => {
            if (stopped)
                return;
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
async function startLogStreamListener(api, eventLog, logFileName) {
    const config = api.getConfig();
    (0, utils_1.logStreamEvent)(`Start log stream listener ${logFileName}`);
    const { environment } = (0, utils_1.names)(config);
    const logGroupName = `/aws/elasticbeanstalk/${environment}/${logFileName}`;
    await startInstanceListeners(logGroupName, getInstancesFromLogs(eventLog));
    instanceFinderInterval[logFileName] = setInterval(async () => {
        if (stopped)
            return;
        await startInstanceListeners(logGroupName, getInstancesFromLogs(eventLog));
    }, 5000);
}
async function stopLogStreamListener() {
    stopped = true;
    for (const logName in instanceFinderInterval) {
        const listener = instanceFinderInterval[logName];
        (0, utils_1.logStreamEvent)(`Stop log stream listener ${logName}`);
        clearInterval(listener);
        delete instanceFinderInterval[logName];
    }
    for (const instanceName in activeInstanceListeners) {
        const listener = activeInstanceListeners[instanceName];
        (0, utils_1.logStreamEvent)(`Stop log stream listener ${instanceName}`);
        clearInterval(listener);
        delete activeInstanceListeners[instanceName];
    }
}
//# sourceMappingURL=deployment-logs.js.map