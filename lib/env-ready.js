"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastEvent = getLastEvent;
exports.showEvents = showEvents;
exports.waitForEnvReady = waitForEnvReady;
exports.waitForHealth = waitForHealth;
const utils_1 = require("./utils");
const aws_1 = require("./aws");
const recheck_1 = require("./recheck");
async function getLastEvent(config) {
    const { environment } = (0, utils_1.names)(config);
    const { Events } = await aws_1.beanstalk.describeEvents({
        EnvironmentName: environment,
        MaxRecords: 5
    });
    if (!Events || Events.length === 0) {
        return;
    }
    return Events[0].EventDate;
}
async function showEvents(config, eventHistory, lastEventDate) {
    const { environment, app } = (0, utils_1.names)(config);
    const { Events } = await aws_1.beanstalk.describeEvents({
        EnvironmentName: environment,
        ApplicationName: app,
        StartTime: lastEventDate
    });
    if (!Events || Events.length === 0) {
        return lastEventDate;
    }
    Events.forEach((event) => {
        var _a;
        if (((_a = event.EventDate) === null || _a === void 0 ? void 0 : _a.toString()) === (lastEventDate === null || lastEventDate === void 0 ? void 0 : lastEventDate.toString())) {
            return;
        }
        console.log(`  Env Event: ${event.Message}`);
        eventHistory.push(event);
    });
    return Events[0].EventDate ? new Date(Events[0].EventDate) : undefined;
}
async function checker(config, prop, wantedValue, showProgress, eventHistory) {
    const { environment, app } = (0, utils_1.names)(config);
    let lastEventDate;
    let lastStatus;
    if (showProgress) {
        lastEventDate = await getLastEvent(config);
    }
    return new Promise((resolve, reject) => {
        async function check() {
            var _a;
            let result;
            try {
                result = await aws_1.beanstalk.describeEnvironments({
                    EnvironmentNames: [environment],
                    ApplicationName: app
                });
            }
            catch (e) {
                if ((0, recheck_1.checkForThrottlingException)(e)) {
                    (0, recheck_1.handleThrottlingException)();
                    return setTimeout(check, (0, recheck_1.getRecheckInterval)());
                }
                console.log(e);
                reject(e);
            }
            const Environment = (_a = result.Environments) === null || _a === void 0 ? void 0 : _a[0];
            const value = Environment === null || Environment === void 0 ? void 0 : Environment[prop];
            if (value !== wantedValue && value !== lastStatus) {
                const text = prop === 'Health' ? `be ${wantedValue}` : `finish ${value}`;
                (0, utils_1.logStep)(`=> Waiting for Beanstalk environment to ${text.toLocaleLowerCase()}`);
                lastStatus = value;
            }
            else if (value === wantedValue) {
                // TODO: run showEvents one last time
                resolve();
                return;
            }
            if (showProgress) {
                try {
                    lastEventDate = await showEvents(config, eventHistory, lastEventDate);
                }
                catch (e) {
                    if ((0, recheck_1.checkForThrottlingException)(e)) {
                        (0, recheck_1.handleThrottlingException)();
                    }
                    else {
                        console.log(e);
                    }
                }
            }
            return setTimeout(check, (0, recheck_1.getRecheckInterval)());
        }
        check();
    });
}
async function waitForEnvReady(config, showProgress, eventHistory = []) {
    await checker(config, 'Status', 'Ready', showProgress, eventHistory);
}
async function waitForHealth(config, health = 'Green', showProgress) {
    await checker(config, 'Health', health, showProgress, []);
}
//# sourceMappingURL=env-ready.js.map