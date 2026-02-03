"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
exports.verifyAwsAccount = verifyAwsAccount;
const joi_1 = __importDefault(require("joi"));
const client_sts_1 = require("@aws-sdk/client-sts");
const client_iam_1 = require("@aws-sdk/client-iam");
const client_organizations_1 = require("@aws-sdk/client-organizations");
const client_account_1 = require("@aws-sdk/client-account");
const schema = joi_1.default.object().keys({
    name: joi_1.default.string().min(1).required(),
    path: joi_1.default.string().min(1).required(),
    type: joi_1.default.string().required(),
    envName: joi_1.default.string().min(1),
    envType: joi_1.default.string().valid('webserver', 'worker'),
    buildOptions: joi_1.default.object().keys({
        serverOnly: joi_1.default.bool(),
        debug: joi_1.default.bool(),
        buildLocation: joi_1.default.string(),
        mobileSettings: joi_1.default.object(),
        server: joi_1.default.string().uri(),
        allowIncompatibleUpdates: joi_1.default.boolean(),
        executable: joi_1.default.string()
    }),
    // The meteor plugin adds the docker object, which is a bug in mup
    docker: joi_1.default.object(),
    env: joi_1.default.object(),
    auth: joi_1.default.object().keys({
        id: joi_1.default.string(),
        secret: joi_1.default.string(),
        profile: joi_1.default.string()
    }).required(),
    sslDomains: joi_1.default.array().items(joi_1.default.string()),
    forceSSL: joi_1.default.bool(),
    streamLogs: joi_1.default.bool(),
    region: joi_1.default.string(),
    minInstances: joi_1.default.number().min(1).required(),
    maxInstances: joi_1.default.number().min(1),
    instanceType: joi_1.default.string(),
    gracefulShutdown: joi_1.default.bool(),
    longEnvVars: joi_1.default.bool(),
    requireInstanceRole: joi_1.default.bool(),
    yumPackages: joi_1.default.object().pattern(/[/s/S]*/, [joi_1.default.string().allow('')]),
    oldVersions: joi_1.default.number(),
    customBeanstalkConfig: joi_1.default.array().items(joi_1.default.object({
        namespace: joi_1.default.string().trim().required(),
        resource: joi_1.default.string().trim().optional(),
        option: joi_1.default.string().trim().required(),
        value: joi_1.default.string().trim().required()
    })),
    sshKey: {
        privateKey: joi_1.default.string().required(),
        publicKey: joi_1.default.string().required()
    },
    awsPlatformBranchName: joi_1.default.string().min(1).required(),
    awsAccountName: joi_1.default.string().min(1).required()
});
async function default_1(config, utils) {
    let details = [];
    details = utils.combineErrorDetails(details, schema.validate(config.app, utils.VALIDATE_OPTIONS));
    if (config.app && config.app.name && config.app.name.length < 4) {
        details.push({
            message: 'must have at least 4 characters',
            path: 'name'
        });
    }
    // Validate that either profile or credentials (id and secret) are provided
    if (config.app && config.app.auth) {
        const hasProfile = config.app.auth.profile && config.app.auth.profile.length > 0;
        const hasCredentials = config.app.auth.id &&
            config.app.auth.id.length > 0 &&
            config.app.auth.secret &&
            config.app.auth.secret.length > 0;
        if (!hasProfile && !hasCredentials) {
            details.push({
                message: 'Either auth.profile or auth credentials (id and secret) must be provided',
                path: 'auth'
            });
        }
        // Ensure both id and secret are provided together if one is provided
        if ((config.app.auth.id && !config.app.auth.secret) ||
            (!config.app.auth.id && config.app.auth.secret)) {
            details.push({
                message: 'Both auth.id and auth.secret must be provided together',
                path: 'auth'
            });
        }
    }
    return utils.addLocation(details, 'app');
}
async function verifyAwsAccount(config) {
    var _a, _b, _c;
    if (!config.app || config.app.type !== 'aws-beanstalk') {
        return;
    }
    const hasProfile = ((_a = config.app.auth) === null || _a === void 0 ? void 0 : _a.profile) && config.app.auth.profile.length > 0;
    const hasCredentials = ((_b = config.app.auth) === null || _b === void 0 ? void 0 : _b.id) &&
        config.app.auth.id.length > 0 &&
        ((_c = config.app.auth) === null || _c === void 0 ? void 0 : _c.secret) &&
        config.app.auth.secret.length > 0;
    if (hasProfile || hasCredentials) {
        await printAwsAccountInfo(config);
    }
}
async function printAwsAccountInfo(config) {
    var _a, _b, _c;
    const commonOptions = {
        credentials: config.app.auth.profile ? undefined : {
            accessKeyId: config.app.auth.id,
            secretAccessKey: config.app.auth.secret,
        },
        region: config.app.region || 'us-east-1'
    };
    // Set AWS_PROFILE environment variable if profile is specified
    if (config.app.auth.profile) {
        console.log(`   Setting AWS_PROFILE to: ${config.app.auth.profile}`);
        process.env.AWS_PROFILE = config.app.auth.profile;
    }
    const sts = new client_sts_1.STS(commonOptions);
    const iam = new client_iam_1.IAM(commonOptions);
    const organizations = new client_organizations_1.Organizations(commonOptions);
    const account = new client_account_1.Account(commonOptions);
    // Get caller identity (account ID, user ARN, etc.)
    console.log('   Attempting to get AWS caller identity...');
    let identity;
    try {
        identity = await sts.getCallerIdentity({});
        console.log('   ✅ Successfully authenticated with AWS');
    }
    catch (error) {
        console.log('   ❌ Failed to authenticate with AWS');
        console.log(`   Error: ${error.message}`);
        console.log(`   Error name: ${error.name}`);
        if (error.name === 'CredentialsProviderError') {
            console.log('\n💡 Credential Provider Error Details:');
            console.log('   This usually means:');
            console.log('   1. SSO session expired - run: aws sso login --profile <profile-name>');
            console.log('   2. Profile not found in ~/.aws/config');
            console.log('   3. Invalid access keys');
            console.log('');
        }
        throw error;
    }
    const accountId = identity.Account;
    const expectedAccountName = config.app.awsAccountName;
    let actualAccountName;
    let accountCreatedDate;
    let accountEmail;
    let accountAlias;
    let organizationJoinedDate;
    // Try to get account information using the Account Management API (best option)
    try {
        const accountInfo = await account.send(new client_account_1.GetAccountInformationCommand({}));
        if (accountInfo.AccountName) {
            actualAccountName = accountInfo.AccountName;
        }
        if (accountInfo.AccountCreatedDate) {
            accountCreatedDate = accountInfo.AccountCreatedDate;
        }
    }
    catch (error) {
        // Try Organizations API as fallback
        try {
            const accountInfo = await organizations.send(new client_organizations_1.DescribeAccountCommand({
                AccountId: accountId
            }));
            if ((_a = accountInfo.Account) === null || _a === void 0 ? void 0 : _a.Name) {
                actualAccountName = accountInfo.Account.Name;
            }
            if ((_b = accountInfo.Account) === null || _b === void 0 ? void 0 : _b.Email) {
                accountEmail = accountInfo.Account.Email;
            }
            if ((_c = accountInfo.Account) === null || _c === void 0 ? void 0 : _c.JoinedTimestamp) {
                organizationJoinedDate = accountInfo.Account.JoinedTimestamp.toISOString();
            }
        }
        catch (orgError) {
            // Could not get account name from either API
        }
    }
    // Try to get account alias
    try {
        const aliases = await iam.listAccountAliases({});
        if (aliases.AccountAliases && aliases.AccountAliases.length > 0) {
            accountAlias = aliases.AccountAliases[0];
        }
    }
    catch (error) {
        // Ignore alias errors
    }
    // Check if account name matches
    const accountNameMatches = actualAccountName === expectedAccountName;
    if (accountNameMatches) {
        // Account name matches - print minimal info
        console.log('\n✅ AWS Account Verification:');
        console.log(`   Account Name: ${actualAccountName} (matches expected)`);
        console.log('');
    }
    else {
        // Account name does NOT match - print full info and halt
        console.log('\n❌ AWS Account Verification FAILED:');
        console.log(`   Expected Account Name: ${expectedAccountName}`);
        console.log(`   Actual Account Name:   ${actualAccountName || '(unable to retrieve)'}`);
        console.log('');
        console.log('   Full Account Information:');
        console.log(`   Account ID: ${accountId}`);
        console.log(`   User ARN: ${identity.Arn}`);
        console.log(`   User ID: ${identity.UserId}`);
        if (accountCreatedDate) {
            const dateStr = accountCreatedDate instanceof Date
                ? accountCreatedDate.toISOString()
                : accountCreatedDate;
            console.log(`   Account Created: ${dateStr}`);
        }
        if (accountEmail) {
            console.log(`   Account Email: ${accountEmail}`);
        }
        if (organizationJoinedDate) {
            console.log(`   Joined Organization: ${organizationJoinedDate}`);
        }
        if (accountAlias) {
            console.log(`   Account Alias: ${accountAlias}`);
        }
        else {
            console.log(`   Account Alias: (none set)`);
        }
        console.log('');
        console.log('⛔ Deployment halted due to account name mismatch.');
        console.log('   Please verify you are deploying to the correct AWS account.');
        console.log('');
        // Throw error to halt processing
        throw new Error(`AWS Account name mismatch: Expected "${expectedAccountName}" but got "${actualAccountName || 'unknown'}"`);
    }
}
//# sourceMappingURL=validate.js.map