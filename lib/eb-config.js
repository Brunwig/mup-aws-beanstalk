"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDesiredConfig = createDesiredConfig;
exports.scalingConfigChanged = scalingConfigChanged;
exports.scalingConfig = scalingConfig;
exports.convertToObject = convertToObject;
exports.mergeConfigs = mergeConfigs;
exports.diffConfig = diffConfig;
exports.prepareUpdateEnvironment = prepareUpdateEnvironment;
exports.getEnvTierConfig = getEnvTierConfig;
const lodash_1 = require("lodash");
const aws_1 = require("./aws");
const download_1 = __importDefault(require("./download"));
const env_settings_1 = require("./env-settings");
const upload_1 = require("./upload");
const utils_1 = require("./utils");
const versions_1 = require("./versions");
function createDesiredConfig(mupConfig, settings, longEnvVarsVersion) {
    const { env, instanceType, streamLogs, customBeanstalkConfig = [] } = mupConfig.app;
    const { instanceProfile, serviceRole } = (0, utils_1.names)(mupConfig);
    const config = {
        OptionSettings: [{
                Namespace: 'aws:autoscaling:trigger',
                OptionName: 'MeasureName',
                Value: 'CPUUtilization'
            }, {
                Namespace: 'aws:autoscaling:trigger',
                OptionName: 'Statistic',
                Value: 'Average'
            }, {
                Namespace: 'aws:autoscaling:trigger',
                OptionName: 'Unit',
                Value: 'Percent'
            }, {
                Namespace: 'aws:autoscaling:trigger',
                OptionName: 'UpperThreshold',
                Value: '75'
            }, {
                Namespace: 'aws:autoscaling:trigger',
                OptionName: 'LowerThreshold',
                Value: '35'
            }, {
                Namespace: 'aws:autoscaling:launchconfiguration',
                OptionName: 'InstanceType',
                Value: instanceType
            }, {
                Namespace: 'aws:autoscaling:launchconfiguration',
                OptionName: 'IamInstanceProfile',
                Value: instanceProfile
            }, {
                Namespace: 'aws:autoscaling:launchconfiguration',
                OptionName: 'DisableIMDSv1',
                Value: 'true'
            }, {
                Namespace: 'aws:elasticbeanstalk:environment:process:default',
                OptionName: 'HealthyThresholdCount',
                Value: '2'
            }, {
                Namespace: 'aws:elasticbeanstalk:environment:process:default',
                OptionName: 'HealthCheckPath',
                Value: '/aws-health-check-3984729847289743128904723'
            }, {
                Namespace: 'aws:elasticbeanstalk:environment',
                OptionName: 'EnvironmentType',
                Value: 'LoadBalanced'
            }, {
                Namespace: 'aws:elasticbeanstalk:environment',
                OptionName: 'LoadBalancerType',
                Value: 'application'
            }, {
                Namespace: 'aws:elasticbeanstalk:command',
                OptionName: 'DeploymentPolicy',
                Value: 'RollingWithAdditionalBatch'
            }, {
                Namespace: 'aws:elasticbeanstalk:command',
                OptionName: 'BatchSizeType',
                Value: 'Percentage'
            }, {
                Namespace: 'aws:elasticbeanstalk:command',
                OptionName: 'BatchSize',
                Value: '30'
            }, {
                Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
                OptionName: 'RollingUpdateEnabled',
                Value: 'true'
            }, {
                Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
                OptionName: 'RollingUpdateType',
                Value: 'Health'
            }, {
                Namespace: 'aws:elasticbeanstalk:environment',
                OptionName: 'ServiceRole',
                Value: serviceRole
            }, {
                Namespace: 'aws:elasticbeanstalk:healthreporting:system',
                OptionName: 'SystemType',
                Value: 'enhanced'
            }, {
                Namespace: 'aws:elasticbeanstalk:environment:process:default',
                OptionName: 'StickinessEnabled',
                Value: 'true'
            }, {
                Namespace: 'aws:elasticbeanstalk:environment:process:default',
                OptionName: 'DeregistrationDelay',
                Value: '75'
            }]
    };
    if (streamLogs) {
        config.OptionSettings.push({
            Namespace: 'aws:elasticbeanstalk:cloudwatch:logs',
            OptionName: 'StreamLogs',
            Value: 'true'
        });
    }
    const settingsString = JSON.stringify(settings);
    if (longEnvVarsVersion) {
        config.OptionSettings.push({
            Namespace: 'aws:elasticbeanstalk:application:environment',
            OptionName: 'MUP_ENV_FILE_VERSION',
            Value: longEnvVarsVersion.toString()
        });
    }
    else {
        env.METEOR_SETTINGS_ENCODED = encodeURIComponent(settingsString);
        Object.keys(env).forEach((envName) => {
            const value = env[envName];
            config.OptionSettings.push({
                Namespace: 'aws:elasticbeanstalk:application:environment',
                OptionName: envName,
                Value: value.toString()
            });
        });
    }
    const customOptions = customBeanstalkConfig.map(option => ({
        Namespace: option.namespace,
        ...((option === null || option === void 0 ? void 0 : option.resource) && { ResourceName: option.resource }),
        OptionName: option.option,
        Value: option.value
    }));
    config.OptionSettings = mergeConfigs(config.OptionSettings, customOptions);
    return config;
}
function scalingConfigChanged(currentConfig, mupConfig) {
    const { minInstances, maxInstances } = mupConfig.app;
    let currentMinInstances = "0";
    let currentMaxInstances = "0";
    currentConfig.forEach((item) => {
        if (item.Namespace === 'aws:autoscaling:asg') {
            if (item.OptionName === 'MinSize') {
                currentMinInstances = item.Value;
            }
            else if (item.OptionName === 'MaxSize') {
                currentMaxInstances = item.Value;
            }
        }
    });
    return currentMinInstances !== minInstances.toString() ||
        currentMaxInstances !== maxInstances.toString();
}
function scalingConfig({ minInstances, maxInstances }) {
    return {
        OptionSettings: [
            {
                Namespace: 'aws:autoscaling:asg',
                OptionName: 'MinSize',
                Value: minInstances.toString()
            }, {
                Namespace: 'aws:autoscaling:asg',
                OptionName: 'MaxSize',
                Value: maxInstances.toString()
            }
        ]
    };
}
function convertToObject(result, option) {
    if (!option) {
        return result;
    }
    // result[`${option.Namespace!}-${option.OptionName!}`] = option as EBConfigElement;
    const resourceKey = option.ResourceName ? `-${option.ResourceName}` : '';
    // const key = [`${option.Namespace}-${option.OptionName}${resourceKey}`];
    const key = `${option.Namespace}-${option.OptionName}${resourceKey}`;
    result[key] = option;
    console.log("convertToObj -->", result[key], resourceKey, key);
    return result;
}
function mergeConfigs(config1, config2) {
    const configDict = config1.reduce(convertToObject, {});
    config2.forEach((option) => {
        const resourceKey = option.ResourceName ? `-${option.ResourceName}` : '';
        //const key = [`${option.Namespace}-${option.OptionName}${resourceKey}`];
        const key = `${option.Namespace}-${option.OptionName}${resourceKey}`;
        configDict[key] = option;
        console.log("mergeConfigs -->", configDict[key], resourceKey, key);
    });
    return Object.values(configDict);
}
function diffConfig(current, desired) {
    const currentConfigDict = current.reduce(convertToObject, {});
    const desiredConfigDict = desired.reduce(convertToObject, {});
    const toRemove = (0, lodash_1.difference)(Object.keys(currentConfigDict), Object.keys(desiredConfigDict))
        .filter(key => key.indexOf('aws:elasticbeanstalk:application:environment-') === 0)
        .map((key) => {
        const option = currentConfigDict[key];
        return {
            Namespace: option.Namespace,
            OptionName: option.OptionName
        };
    });
    const toUpdate = Object.keys(desiredConfigDict).filter((key) => {
        if (key in currentConfigDict && currentConfigDict[key].Value === desiredConfigDict[key].Value) {
            return false;
        }
        return true;
    }).map(key => desiredConfigDict[key]);
    return {
        toRemove,
        toUpdate
    };
}
async function prepareUpdateEnvironment(api) {
    const config = api.getConfig();
    const { app, environment, bucket } = (0, utils_1.names)(config);
    const { ConfigurationSettings } = await aws_1.beanstalk.describeConfigurationSettings({
        EnvironmentName: environment,
        ApplicationName: app
    });
    const { longEnvVars } = config.app;
    let nextEnvVersion = 0;
    let envSettingsChanged;
    let desiredSettings;
    if (longEnvVars) {
        const currentEnvVersion = await (0, versions_1.largestEnvVersion)(api);
        const currentSettings = await (0, download_1.default)(bucket, currentEnvVersion);
        desiredSettings = (0, env_settings_1.createEnvFile)(config.app.env, api.getSettings());
        envSettingsChanged = currentSettings !== desiredSettings;
        if (envSettingsChanged) {
            nextEnvVersion = currentEnvVersion + 1;
            await (0, upload_1.uploadEnvFile)(bucket, nextEnvVersion, desiredSettings);
        }
        else {
            nextEnvVersion = currentEnvVersion;
        }
    }
    const desiredEbConfig = createDesiredConfig(api.getConfig(), api.getSettings(), nextEnvVersion);
    const { toRemove, toUpdate } = diffConfig(ConfigurationSettings[0].OptionSettings, desiredEbConfig.OptionSettings);
    return {
        toRemove,
        toUpdate
    };
}
function getEnvTierConfig(envType) {
    if (envType === 'webserver') {
        return {
            Name: "WebServer",
            Type: "Standard"
        };
    }
    return {
        Name: "Worker",
        Type: "SQS/HTTP"
    };
}
//# sourceMappingURL=eb-config.js.map