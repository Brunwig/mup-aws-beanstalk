"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ec2InstanceConnect = exports.logs = exports.ec2 = exports.ssm = exports.sts = exports.cloudWatchEvents = exports.cloudTrail = exports.acm = exports.autoScaling = exports.iam = exports.beanstalk = exports.s3 = void 0;
exports.default = configure;
const client_iam_1 = require("@aws-sdk/client-iam");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_elastic_beanstalk_1 = require("@aws-sdk/client-elastic-beanstalk");
const client_acm_1 = require("@aws-sdk/client-acm");
const client_auto_scaling_1 = require("@aws-sdk/client-auto-scaling");
const client_cloudwatch_events_1 = require("@aws-sdk/client-cloudwatch-events");
const client_cloudwatch_logs_1 = require("@aws-sdk/client-cloudwatch-logs");
const client_cloudtrail_1 = require("@aws-sdk/client-cloudtrail");
const client_ec2_instance_connect_1 = require("@aws-sdk/client-ec2-instance-connect");
const client_sts_1 = require("@aws-sdk/client-sts");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const client_ec2_1 = require("@aws-sdk/client-ec2");
/* eslint-enable import/no-mutable-exports */
const MAX_RETRY_DELAY = 1000 * 60 * 2;
// const AWS_UPLOAD_TIMEOUT = 1000 * 60 * 60;
function configure({ auth, name: _name, region }) {
    const commonOptions = {
        credentials: auth.profile ? undefined : {
            accessKeyId: auth.id,
            secretAccessKey: auth.secret,
        },
        region: region || 'us-east-1',
        maxRetries: 25,
        retryDelayOptions: {
            customBackoff: (retryCount) => Math.min((2 ** retryCount * 1000), MAX_RETRY_DELAY)
        }
    };
    // Set AWS_PROFILE environment variable if profile is specified
    if (auth.profile) {
        process.env.AWS_PROFILE = auth.profile;
    }
    exports.s3 = new client_s3_1.S3({
        ...commonOptions,
        // params: { Bucket: `mup-${name}` },
        // httpOptions: { timeout: AWS_UPLOAD_TIMEOUT },
    });
    exports.beanstalk = new client_elastic_beanstalk_1.ElasticBeanstalk({ ...commonOptions });
    exports.iam = new client_iam_1.IAM({ ...commonOptions });
    exports.autoScaling = new client_auto_scaling_1.AutoScaling({ ...commonOptions });
    exports.acm = new client_acm_1.ACM({ ...commonOptions });
    exports.cloudTrail = new client_cloudtrail_1.CloudTrail({ ...commonOptions });
    exports.sts = new client_sts_1.STS({ ...commonOptions });
    exports.cloudWatchEvents = new client_cloudwatch_events_1.CloudWatchEvents({ ...commonOptions });
    exports.ssm = new client_ssm_1.SSM({ ...commonOptions });
    exports.ec2 = new client_ec2_1.EC2({ ...commonOptions });
    exports.logs = new client_cloudwatch_logs_1.CloudWatchLogs({ ...commonOptions });
    exports.ec2InstanceConnect = new client_ec2_instance_connect_1.EC2InstanceConnect({ ...commonOptions });
}
//# sourceMappingURL=aws.js.map