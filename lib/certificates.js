"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSSLConfigured = ensureSSLConfigured;
const aws_1 = require("./aws");
const utils_1 = require("./utils");
const eb_config_1 = require("./eb-config");
const env_ready_1 = require("./env-ready");
async function ensureSSLConfigured(config, certificateArn) {
    const { app, environment } = (0, utils_1.names)(config);
    const ebConfig = [{
            Namespace: 'aws:elbv2:listener:443',
            OptionName: 'SSLCertificateArns',
            Value: certificateArn
        }, {
            Namespace: 'aws:elbv2:listener:443',
            OptionName: 'DefaultProcess',
            Value: 'default'
        }, {
            Namespace: 'aws:elbv2:listener:443',
            OptionName: 'ListenerEnabled',
            Value: 'true'
        }, {
            Namespace: 'aws:elbv2:listener:443',
            OptionName: 'Protocol',
            Value: 'HTTPS'
        },
        // Force SSLv3
        {
            Namespace: 'aws:elbv2:listener:443',
            OptionName: 'SSLPolicy',
            Value: 'ELBSecurityPolicy-TLS13-1-2-2021-06'
        }
    ];
    const domains = config.app.sslDomains;
    // we use domains to decide if we need to do something about SSL
    if (!domains || domains.length === 0) {
        return;
    }
    const { ConfigurationSettings } = await aws_1.beanstalk
        .describeConfigurationSettings({
        EnvironmentName: environment,
        ApplicationName: app,
    });
    console.log("--->", "ensureSSLConfigured", ConfigurationSettings);
    const firstConfig = ConfigurationSettings === null || ConfigurationSettings === void 0 ? void 0 : ConfigurationSettings[0];
    const current = firstConfig.OptionSettings.reduce(eb_config_1.convertToObject, {});
    const desired = ebConfig.reduce(eb_config_1.convertToObject, {});
    const needToUpdate = Object.keys(desired).find((key) => !current[key] || current[key].Value !== desired[key].Value);
    if (!needToUpdate) {
        return;
    }
    console.log("--->", "ensureSSLConfigured updateEnvironment", environment, ebConfig);
    await aws_1.beanstalk
        .updateEnvironment({
        EnvironmentName: environment,
        OptionSettings: ebConfig,
    });
    await (0, env_ready_1.waitForEnvReady)(config, true);
}
//# sourceMappingURL=certificates.js.map