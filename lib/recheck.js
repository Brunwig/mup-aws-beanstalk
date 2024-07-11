"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecheckInterval = getRecheckInterval;
exports.checkForThrottlingException = checkForThrottlingException;
exports.handleThrottlingException = handleThrottlingException;
let throttlingExceptionCounter = 0;
function getRecheckInterval() {
    if (throttlingExceptionCounter === 10) {
        throw new Error('Maximum throttling backoff exceeded');
    }
    else {
        return (2 ** throttlingExceptionCounter * 10000);
    }
}
function checkForThrottlingException(exception) {
    return (exception
        && typeof exception === 'object'
        && "code" in exception
        && (exception.code === 'Throttling')
        && "message" in exception
        && (exception.message === 'Rate exceeded'));
}
function handleThrottlingException() {
    throttlingExceptionCounter++;
    console.log(`Setting new re-check interval to ${getRecheckInterval()}ms`);
}
//# sourceMappingURL=recheck.js.map