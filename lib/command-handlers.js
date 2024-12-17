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
exports.setup = setup;
exports.deploy = deploy;
exports.logs = logs;
exports.logsNginx = logsNginx;
exports.logsEb = logsEb;
exports.start = start;
exports.stop = stop;
exports.restart = restart;
exports.clean = clean;
exports.reconfig = reconfig;
exports.events = events;
exports.status = status;
exports.ssl = ssl;
exports.shell = shell;
exports.debug = debug;
const chalk_1 = __importDefault(require("chalk"));
const ssh2_1 = require("ssh2");
const aws_1 = require("./aws");
const certificates_1 = require("./certificates");
const policies_1 = require("./policies");
const upload_1 = __importStar(require("./upload"));
const prepare_bundle_1 = require("./prepare-bundle");
const utils_1 = require("./utils");
const versions_1 = require("./versions");
const env_settings_1 = require("./env-settings");
const eb_config_1 = require("./eb-config");
const env_ready_1 = require("./env-ready");
const deployment_logs_1 = require("./deployment-logs");
const client_elastic_beanstalk_1 = require("@aws-sdk/client-elastic-beanstalk");
async function setup(api) {
    const config = api.getConfig();
    const appConfig = config.app;
    const { bucket: bucketName, app: appName, instanceProfile, serviceRole: serviceRoleName, trailBucketPrefix, trailName, deregisterRuleName, environment: environmentName, eventTargetRole: eventTargetRoleName, eventTargetPolicyName, eventTargetPassRoleName, automationDocument } = (0, utils_1.names)(config);
    (0, utils_1.logStep)('=> Setting up');
    // Create bucket if needed
    const listBucketResult = await aws_1.s3.listBuckets({});
    const Buckets = listBucketResult.Buckets;
    const beanstalkBucketCreated = await (0, utils_1.ensureBucketExists)(Buckets, bucketName, appConfig.region);
    if (beanstalkBucketCreated) {
        console.log('  Created Bucket');
    }
    (0, utils_1.logStep)('=> Ensuring IAM Roles and Instance Profiles are setup');
    // Create role and instance profile
    await (0, utils_1.ensureRoleExists)(instanceProfile, policies_1.rolePolicy);
    await (0, utils_1.ensureInstanceProfileExists)(instanceProfile);
    await (0, utils_1.ensurePoliciesAttached)(instanceProfile, [
        'arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier',
        'arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker',
        'arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier',
        ...appConfig.gracefulShutdown ? ['arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM'] : []
    ]);
    await (0, utils_1.ensureRoleAdded)(instanceProfile, instanceProfile);
    // Create role used by enhanced health
    await (0, utils_1.ensureRoleExists)(serviceRoleName, policies_1.serviceRole);
    await (0, utils_1.ensurePoliciesAttached)(serviceRoleName, [
        'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth',
        'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService'
    ]);
    if (appConfig.gracefulShutdown) {
        const accountId = await (0, utils_1.getAccountId)();
        const policy = (0, policies_1.eventTargetRolePolicy)(accountId, environmentName, appConfig.region || 'us-east-1');
        const passPolicy = (0, policies_1.passRolePolicy)(accountId, eventTargetRoleName);
        await (0, utils_1.ensureRoleExists)(eventTargetRoleName, policies_1.eventTargetRole, true);
        await (0, utils_1.ensureInlinePolicyAttached)(eventTargetRoleName, eventTargetPolicyName, policy);
        await (0, utils_1.ensureInlinePolicyAttached)(eventTargetRoleName, eventTargetPassRoleName, passPolicy);
    }
    // Create beanstalk application if needed
    const { Applications } = await aws_1.beanstalk.describeApplications({});
    if (!(Applications === null || Applications === void 0 ? void 0 : Applications.find(app => app.ApplicationName === appName))) {
        const params = {
            ApplicationName: appName,
            Description: `App "${appConfig.name}" managed by Meteor Up`
        };
        await aws_1.beanstalk.createApplication(params);
        console.log('  Created Beanstalk application');
    }
    if (appConfig.gracefulShutdown) {
        (0, utils_1.logStep)('=> Ensuring Graceful Shutdown is setup');
        const existingBucket = (0, utils_1.findBucketWithPrefix)(Buckets, trailBucketPrefix);
        const trailBucketName = existingBucket ?
            existingBucket.Name :
            (0, utils_1.createUniqueName)(trailBucketPrefix);
        const region = appConfig.region || 'us-east-1';
        const accountId = await (0, utils_1.getAccountId)();
        const policy = (0, policies_1.trailBucketPolicy)(accountId, trailBucketName);
        const trailBucketCreated = await (0, utils_1.ensureBucketExists)(Buckets, trailBucketName, appConfig.region);
        await (0, utils_1.ensureBucketPolicyAttached)(trailBucketName, policy);
        if (trailBucketCreated) {
            console.log('  Created bucket for Cloud Trail');
        }
        const params = {
            trailNameList: [
                trailName
            ]
        };
        const { trailList } = await aws_1.cloudTrail.describeTrails(params);
        if (trailList.length === 0) {
            const createParams = {
                Name: trailName,
                S3BucketName: trailBucketName
            };
            await aws_1.cloudTrail.createTrail(createParams);
            console.log('  Created CloudTrail trail');
        }
        const createdDocument = await (0, utils_1.ensureSsmDocument)(automationDocument, (0, policies_1.gracefulShutdownAutomationDocument)());
        if (createdDocument) {
            console.log('  Created SSM Automation Document');
        }
        const createdRule = await (0, utils_1.ensureCloudWatchRule)(deregisterRuleName, 'Used by Meteor Up for graceful shutdown', policies_1.DeregisterEvent);
        if (createdRule) {
            console.log('  Created Cloud Watch rule');
        }
        const target = (0, policies_1.deregisterEventTarget)(environmentName, eventTargetRoleName, accountId, region);
        const createdTarget = await (0, utils_1.ensureRuleTargetExists)(deregisterRuleName, target);
        if (createdTarget) {
            console.log('  Created target for Cloud Watch rule');
        }
    }
}
async function deploy(api) {
    var _a, _b, _c;
    await api.runCommand('beanstalk.setup');
    const config = api.getConfig();
    const { app, bucket, bundlePrefix, environment } = (0, utils_1.names)(config);
    const version = await (0, versions_1.largestVersion)(api);
    const nextVersion = version + 1;
    // Mutates the config, so the meteor.build command will have the correct build location
    config.app.buildOptions.buildLocation = ((_a = config.app.buildOptions) === null || _a === void 0 ? void 0 : _a.buildLocation) ||
        (0, utils_1.tmpBuildPath)(config.app.path, api);
    const bundlePath = api.resolvePath(config.app.buildOptions.buildLocation, 'bundle.zip');
    const willBuild = (0, utils_1.shouldRebuild)(bundlePath, api.getOptions()['cached-build']);
    if (willBuild) {
        await api.runCommand('meteor.build');
        (0, prepare_bundle_1.injectFiles)(api, app, nextVersion, config.app);
        await (0, prepare_bundle_1.archiveApp)(config.app.buildOptions.buildLocation, api);
    }
    (0, utils_1.logStep)('=> Uploading bundle');
    const key = `${bundlePrefix}${nextVersion}`;
    await (0, upload_1.default)(bucket, `${bundlePrefix}${nextVersion}`, bundlePath);
    (0, utils_1.logStep)('=> Creating version');
    await aws_1.beanstalk.createApplicationVersion({
        ApplicationName: app,
        VersionLabel: nextVersion.toString(),
        Description: (0, utils_1.createVersionDescription)(api, config.app),
        SourceBundle: {
            S3Bucket: bucket,
            S3Key: key
        }
    });
    await api.runCommand('beanstalk.reconfig');
    await (0, env_ready_1.waitForEnvReady)(config, true);
    (0, utils_1.logStep)('=> Deploying new version');
    const { toRemove, toUpdate } = await (0, eb_config_1.prepareUpdateEnvironment)(api);
    const eventLog = [];
    if (api.verbose) {
        console.log('EB Config changes:');
        console.dir({
            toRemove,
            toUpdate
        });
        if (config.app.streamLogs) {
            await (0, deployment_logs_1.startLogStreamListener)(api, eventLog, 'var/log/web.stdout.log');
            await (0, deployment_logs_1.startLogStreamListener)(api, eventLog, 'var/log/eb-hooks.log');
        }
    }
    await aws_1.beanstalk.updateEnvironment({
        EnvironmentName: environment,
        VersionLabel: nextVersion.toString(),
        OptionSettings: toUpdate,
        OptionsToRemove: toRemove
    });
    await (0, env_ready_1.waitForEnvReady)(config, true, eventLog);
    (0, deployment_logs_1.stopLogStreamListener)();
    // XXX Is this necessary?
    // const {
    //   Environments
    // } = await beanstalk.describeEnvironments({
    //   ApplicationName: app,
    //   EnvironmentNames: [environment]
    // });
    await api.runCommand('beanstalk.clean');
    await api.runCommand('beanstalk.ssl');
    // Check if deploy succeeded
    const { Environments: finalEnvironments } = await aws_1.beanstalk.describeEnvironments({
        ApplicationName: app,
        EnvironmentNames: [environment]
    });
    const waitSeconds = 31;
    if (nextVersion.toString() === ((_b = finalEnvironments === null || finalEnvironments === void 0 ? void 0 : finalEnvironments[0]) === null || _b === void 0 ? void 0 : _b.VersionLabel)) {
        if (finalEnvironments[0].Health === client_elastic_beanstalk_1.EnvironmentHealth.Red) {
            console.log(`Health status: ${finalEnvironments[0].Health}, waiting ${waitSeconds} seconds to ensure health status is stable`);
            await new Promise((resolve) => {
                setTimeout(resolve, waitSeconds * 1000);
            });
            const { Environments: reCheckedEnvironments } = await aws_1.beanstalk.describeEnvironments({
                ApplicationName: app,
                EnvironmentNames: [environment]
            });
            if ((reCheckedEnvironments === null || reCheckedEnvironments === void 0 ? void 0 : reCheckedEnvironments[0].Health) === client_elastic_beanstalk_1.EnvironmentHealth.Red) {
                console.log(chalk_1.default.red(`Deploy Failed with invalid Health Status. Visit the Aws Elastic Beanstalk console to view the logs from the failed deploy.`));
                process.exitCode = 1;
            }
        }
        if (config.app.envType === "worker") {
            console.log(chalk_1.default.green(`Worker is running.`));
        }
        else {
            console.log(chalk_1.default.green(`App is running at ${finalEnvironments[0].CNAME}`));
        }
    }
    else {
        console.log(chalk_1.default.red(`Deploy Failed. Version expected ${nextVersion.toString()} (found ${(_c = finalEnvironments === null || finalEnvironments === void 0 ? void 0 : finalEnvironments[0]) === null || _c === void 0 ? void 0 : _c.VersionLabel}). Visit the Aws Elastic Beanstalk console to view the logs from the failed deploy.`));
        process.exitCode = 1;
    }
}
async function logs(api) {
    const logsContent = await (0, utils_1.getLogs)(api, ['web.stdout.log', 'nodejs/nodejs.log']);
    logsContent.forEach(({ instance, data }) => {
        console.log(`${instance} `, data[0] || data[1]);
    });
}
async function logsNginx(api) {
    const logsContent = await (0, utils_1.getLogs)(api, ['nginx/error.log', 'nginx/access.log']);
    logsContent.forEach(({ instance, data }) => {
        console.log(`${instance} `, data[0]);
        console.log(`${instance} `, data[1]);
    });
}
async function logsEb(api) {
    const logsContent = await (0, utils_1.getLogs)(api, ['eb-engine.log', 'eb-activity.log']);
    logsContent.forEach(({ data, instance }) => {
        console.log(`${instance} `, data[0] || data[1]);
    });
}
async function start(api) {
    const config = api.getConfig();
    const { environment } = (0, utils_1.names)(config);
    (0, utils_1.logStep)('=> Starting App');
    const { EnvironmentResources } = await aws_1.beanstalk.describeEnvironmentResources({
        EnvironmentName: environment
    });
    const autoScalingGroup = EnvironmentResources.AutoScalingGroups[0].Name;
    const { minInstances, maxInstances } = config.app;
    await aws_1.autoScaling.updateAutoScalingGroup({
        AutoScalingGroupName: autoScalingGroup,
        MaxSize: maxInstances,
        MinSize: minInstances,
        DesiredCapacity: minInstances
    });
    await (0, env_ready_1.waitForHealth)(config, undefined, false);
}
async function stop(api) {
    const config = api.getConfig();
    const { environment } = (0, utils_1.names)(config);
    (0, utils_1.logStep)('=> Stopping App');
    const { EnvironmentResources } = await aws_1.beanstalk.describeEnvironmentResources({
        EnvironmentName: environment
    });
    const autoScalingGroup = EnvironmentResources.AutoScalingGroups[0].Name;
    await aws_1.autoScaling.updateAutoScalingGroup({
        AutoScalingGroupName: autoScalingGroup,
        MaxSize: 0,
        MinSize: 0,
        DesiredCapacity: 0
    });
    await (0, env_ready_1.waitForHealth)(config, 'Grey', false);
}
async function restart(api) {
    const config = api.getConfig();
    const { environment } = (0, utils_1.names)(config);
    (0, utils_1.logStep)('=> Restarting App');
    await aws_1.beanstalk.restartAppServer({
        EnvironmentName: environment
    });
    await (0, env_ready_1.waitForEnvReady)(config, false);
}
async function clean(api) {
    const config = api.getConfig();
    const { app, bucket } = (0, utils_1.names)(config);
    (0, utils_1.logStep)('=> Finding old versions');
    const { versions } = await (0, versions_1.oldVersions)(api);
    const envVersions = await (0, versions_1.oldEnvVersions)(api);
    (0, utils_1.logStep)('=> Removing old versions');
    const promises = [];
    for (let i = 0; i < versions.length; i++) {
        promises.push(aws_1.beanstalk.deleteApplicationVersion({
            ApplicationName: app,
            VersionLabel: versions[i].toString(),
            DeleteSourceBundle: true
        }));
    }
    for (let i = 0; i < envVersions.length; i++) {
        promises.push(aws_1.s3.deleteObject({
            Bucket: bucket,
            Key: `env/${envVersions[i]}.txt`
        }));
    }
    // TODO: remove bundles
    await Promise.all(promises);
}
async function reconfig(api) {
    const config = api.getConfig();
    const { app, environment, bucket } = (0, utils_1.names)(config);
    const deploying = !!api.commandHistory.find(entry => entry.name === 'beanstalk.deploy');
    (0, utils_1.logStep)('=> Configuring Beanstalk environment');
    // check if env exists
    const { Environments } = await aws_1.beanstalk.describeEnvironments({
        ApplicationName: app,
        EnvironmentNames: [environment]
    });
    const environmentExists = Environments.find(env => env.Status !== 'Terminated');
    if (!environmentExists) {
        const desiredEbConfig = (0, eb_config_1.createDesiredConfig)(api.getConfig(), api.getSettings(), config.app.longEnvVars ? 1 : false);
        if (config.app.longEnvVars) {
            const envContent = (0, env_settings_1.createEnvFile)(config.app.env, api.getSettings());
            await (0, upload_1.uploadEnvFile)(bucket, 1, envContent);
        }
        const platformArn = await (0, utils_1.selectPlatformArn)();
        const [version] = await (0, versions_1.ebVersions)(api);
        // Whether this is a web or worker environment
        const envTierConfig = (0, eb_config_1.getEnvTierConfig)(config.app.envType);
        await aws_1.beanstalk.createEnvironment({
            ApplicationName: app,
            EnvironmentName: environment,
            Description: `Environment for ${config.app.name}, managed by Meteor Up`,
            VersionLabel: version.toString(),
            PlatformArn: platformArn,
            Tier: envTierConfig,
            OptionSettings: desiredEbConfig.OptionSettings
        });
        console.log(' Created Environment');
        await (0, env_ready_1.waitForEnvReady)(config, false);
    }
    else if (!deploying) {
        // If we are deploying, the environment will be updated
        // at the same time we update the environment version
        const { toRemove, toUpdate } = await (0, eb_config_1.prepareUpdateEnvironment)(api);
        if (api.verbose) {
            console.log('EB Config changes:');
            console.dir({
                toRemove,
                toUpdate
            });
        }
        if (toRemove.length > 0 || toUpdate.length > 0) {
            await (0, env_ready_1.waitForEnvReady)(config, true);
            await aws_1.beanstalk.updateEnvironment({
                EnvironmentName: environment,
                OptionSettings: toUpdate,
                OptionsToRemove: toRemove
            });
            console.log('  Updated Environment');
            await (0, env_ready_1.waitForEnvReady)(config, true);
        }
    }
    const { ConfigurationSettings } = await aws_1.beanstalk.describeConfigurationSettings({
        EnvironmentName: environment,
        ApplicationName: app
    });
    if ((0, eb_config_1.scalingConfigChanged)(ConfigurationSettings[0].OptionSettings, config)) {
        (0, utils_1.logStep)('=> Configuring scaling');
        await aws_1.beanstalk.updateEnvironment({
            EnvironmentName: environment,
            OptionSettings: (0, eb_config_1.scalingConfig)(config.app).OptionSettings
        });
        await (0, env_ready_1.waitForEnvReady)(config, true);
    }
}
async function events(api) {
    const { environment } = (0, utils_1.names)(api.getConfig());
    const { Events: envEvents } = await aws_1.beanstalk.describeEvents({
        EnvironmentName: environment
    });
    console.log(envEvents.map(ev => `${ev.EventDate}: ${ev.Message}`).join('\n'));
}
async function status(api) {
    const { environment } = (0, utils_1.names)(api.getConfig());
    let result;
    try {
        result = await aws_1.beanstalk.describeEnvironmentHealth({
            AttributeNames: [
                'All'
            ],
            EnvironmentName: environment
        });
    }
    catch (e) {
        // @ts-ignore
        if (e.message.includes('No Environment found for EnvironmentName')) {
            console.log(' AWS Beanstalk environment does not exist');
            return;
        }
        throw e;
    }
    const { InstanceHealthList } = await aws_1.beanstalk.describeInstancesHealth({
        AttributeNames: [
            'All'
        ],
        EnvironmentName: environment
    });
    const { RequestCount, Duration, StatusCodes, Latency } = result.ApplicationMetrics;
    console.log(`Environment Status: ${result.Status}`);
    console.log(`Health Status: ${(0, utils_1.coloredStatusText)(result.Color, result.HealthStatus)}`);
    if (result.Causes.length > 0) {
        console.log('Causes: ');
        result.Causes.forEach(cause => console.log(`  ${cause}`));
    }
    console.log('');
    console.log(`=== Metrics For Last ${Duration || 'Unknown'} Minutes ===`);
    console.log(`  Requests: ${RequestCount}`);
    if (StatusCodes) {
        console.log('  Status Codes');
        console.log(`    2xx: ${StatusCodes.Status2xx}`);
        console.log(`    3xx: ${StatusCodes.Status3xx}`);
        console.log(`    4xx: ${StatusCodes.Status4xx}`);
        console.log(`    5xx: ${StatusCodes.Status5xx}`);
    }
    if (Latency) {
        console.log('  Latency');
        console.log(`    99.9%: ${Latency.P999}`);
        console.log(`    99%  : ${Latency.P99}`);
        console.log(`    95%  : ${Latency.P95}`);
        console.log(`    90%  : ${Latency.P90}`);
        console.log(`    85%  : ${Latency.P85}`);
        console.log(`    75%  : ${Latency.P75}`);
        console.log(`    50%  : ${Latency.P50}`);
        console.log(`    10%  : ${Latency.P10}`);
    }
    console.log('');
    console.log('=== Instances ===');
    InstanceHealthList.forEach((instance) => {
        console.log(`  ${instance.InstanceId}: ${(0, utils_1.coloredStatusText)(instance.Color, instance.HealthStatus)}`);
    });
    if (InstanceHealthList.length === 0) {
        console.log('  0 Instances');
    }
}
async function ssl(api) {
    const config = api.getConfig();
    // Worker envs don't need ssl
    if (config.app.envType !== 'webserver')
        return;
    await (0, env_ready_1.waitForEnvReady)(config, true);
    if (!config.app || !config.app.sslDomains) {
        (0, utils_1.logStep)('=> Updating Beanstalk SSL Config');
        await (0, certificates_1.ensureSSLConfigured)(config);
        return;
    }
    (0, utils_1.logStep)('=> Checking Certificate Status');
    const domains = config.app.sslDomains;
    const { CertificateSummaryList } = await aws_1.acm.listCertificates({});
    let found = null;
    for (let i = 0; i < CertificateSummaryList.length; i++) {
        const { DomainName, CertificateArn } = CertificateSummaryList[i];
        if (DomainName === domains[0]) {
            const { Certificate } = await aws_1.acm.describeCertificate({
                CertificateArn
            });
            if (domains.join(',') === Certificate.SubjectAlternativeNames.join(',')) {
                found = CertificateSummaryList[i];
            }
        }
    }
    let certificateArn;
    if (!found) {
        (0, utils_1.logStep)('=> Requesting Certificate');
        const result = await aws_1.acm.requestCertificate({
            DomainName: domains.shift(),
            SubjectAlternativeNames: domains.length > 0 ? domains : undefined
        });
        certificateArn = result.CertificateArn;
    }
    if (found) {
        certificateArn = found.CertificateArn;
    }
    let emailsProvided = false;
    let checks = 0;
    let certificate;
    /* eslint-disable no-await-in-loop */
    while (!emailsProvided && checks < 5) {
        const certRes = await aws_1.acm.describeCertificate({
            CertificateArn: certificateArn
        });
        const Certificate = certRes.Certificate;
        const validationOptions = Certificate.DomainValidationOptions[0];
        if (typeof validationOptions.ValidationEmails === 'undefined') {
            emailsProvided = true;
            certificate = Certificate;
        }
        else if (validationOptions.ValidationEmails.length > 0 || checks === 6) {
            emailsProvided = true;
            certificate = Certificate;
        }
        else {
            checks += 1;
            await new Promise((resolve) => {
                setTimeout(resolve, 1000 * 10);
            });
        }
    }
    if (certificate && certificate.Status === 'PENDING_VALIDATION') {
        console.log('Certificate is pending validation.');
        certificate.DomainValidationOptions.forEach(({ DomainName, ValidationEmails, ValidationDomain, ValidationStatus }) => {
            if (ValidationStatus === 'SUCCESS') {
                console.log(chalk_1.default.green(`${ValidationDomain || DomainName} has been verified`));
                return;
            }
            console.log(chalk_1.default.yellow(`${ValidationDomain || DomainName} is pending validation`));
            if (ValidationEmails) {
                console.log('Emails with instructions have been sent to:');
                ValidationEmails.forEach((email) => {
                    console.log(`  ${email}`);
                });
            }
            console.log('Run "mup beanstalk ssl" after you have verified the domains, or to check the verification status');
        });
    }
    else if (certificate && certificate.Status === 'ISSUED') {
        console.log(chalk_1.default.green('Certificate has been issued'));
        (0, utils_1.logStep)('=> Updating Beanstalk SSL config');
        await (0, certificates_1.ensureSSLConfigured)(config, certificateArn);
    }
}
async function shell(api) {
    const { selected, description } = await (0, utils_1.pickInstance)(api.getConfig(), api.getArgs()[2]);
    if (!selected) {
        console.log(description);
        console.log('Run "mup beanstalk shell <instance id>"');
        process.exitCode = 1;
        return;
    }
    const { sshOptions, removeSSHAccess } = await (0, utils_1.connectToInstance)(api, selected, 'mup beanstalk shell');
    const conn = new ssh2_1.Client();
    conn.on('ready', () => {
        conn.exec('sudo node /home/webapp/meteor-shell.js', {
            pty: true
        }, (err, stream) => {
            if (err) {
                throw err;
            }
            stream.on('close', async () => {
                conn.end();
                await removeSSHAccess();
                process.exit();
            });
            process.stdin.setRawMode(true);
            process.stdin.pipe(stream);
            stream.pipe(process.stdout);
            stream.stderr.pipe(process.stderr);
            // @ts-ignore
            stream.setWindow(process.stdout.rows, process.stdout.columns);
            process.stdout.on('resize', () => {
                // @ts-ignore
                stream.setWindow(process.stdout.rows, process.stdout.columns);
            });
        });
    }).connect(sshOptions);
}
async function debug(api) {
    const config = api.getConfig();
    const { selected, description } = await (0, utils_1.pickInstance)(config, api.getArgs()[2]);
    if (!selected) {
        console.log(description);
        console.log('Run "mup beanstalk debug <instance id>"');
        process.exitCode = 1;
        return;
    }
    const { sshOptions, removeSSHAccess } = await (0, utils_1.connectToInstance)(api, selected, 'mup beanstalk debug');
    const conn = new ssh2_1.Client();
    conn.on('ready', async () => {
        const result = await (0, utils_1.executeSSHCommand)(conn, 'sudo pkill -USR1 -u webapp -n node || sudo pkill -USR1 -u nodejs -n node');
        if (api.verbose) {
            console.log(result.output);
        }
        const server = {
            ...sshOptions,
            pem: api.resolvePath(config.app.sshKey.privateKey)
        };
        let loggedConnection = false;
        api.forwardPort({
            server,
            localAddress: '0.0.0.0',
            localPort: 9229,
            remoteAddress: '127.0.0.1',
            remotePort: 9229,
            onError(error) {
                console.error(error);
            },
            onReady() {
                console.log('Connected to server');
                console.log('');
                console.log('Debugger listening on ws://127.0.0.1:9229');
                console.log('');
                console.log('To debug:');
                console.log('1. Open chrome://inspect in Chrome');
                console.log('2. Select "Open dedicated DevTools for Node"');
                console.log('3. Wait a minute while it connects and loads the app.');
                console.log('   When it is ready, the app\'s files will appear in the Sources tab');
                console.log('');
                console.log('Warning: Do not use breakpoints when debugging a production server.');
                console.log('They will pause your server when hit, causing it to not handle methods or subscriptions.');
                console.log('Use logpoints or something else that does not pause the server');
                console.log('');
                console.log('The debugger will be enabled until the next time the app is restarted,');
                console.log('though only accessible while this command is running');
            },
            onConnection() {
                if (!loggedConnection) {
                    // It isn't guaranteed the debugger is connected, but not many
                    // other tools will try to connect to port 9229.
                    console.log('');
                    console.log('Detected by debugger');
                    loggedConnection = true;
                }
            }
        });
    }).connect(sshOptions);
    process.on('SIGINT', async () => {
        await removeSSHAccess();
        process.exit();
    });
}
//# sourceMappingURL=command-handlers.js.map