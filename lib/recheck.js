"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleThrottlingException = exports.checkForThrottlingException = exports.getRecheckInterval = void 0;
let throttlingExceptionCounter = 0;
function getRecheckInterval() {
    if (throttlingExceptionCounter === 10) {
        throw new Error('Maximum throttling backoff exceeded');
    }
    else {
        return (2 ** throttlingExceptionCounter * 10000);
    }
}
exports.getRecheckInterval = getRecheckInterval;
function checkForThrottlingException(exception) {
    return (exception
        && typeof exception === 'object'
        && "code" in exception
        && (exception.code === 'Throttling')
        && "message" in exception
        && (exception.message === 'Rate exceeded'));
}
exports.checkForThrottlingException = checkForThrottlingException;
function handleThrottlingException() {
    throttlingExceptionCounter++;
    console.log(`Setting new re-check interval to ${getRecheckInterval()}ms`);
}
exports.handleThrottlingException = handleThrottlingException;
//# sourceMappingURL=recheck.js.map