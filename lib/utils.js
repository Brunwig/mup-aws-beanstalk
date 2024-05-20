"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeSSHCommand = exports.connectToInstance = exports.pickInstance = exports.ensureSsmDocument = exports.createVersionDescription = exports.coloredStatusText = exports.ensureRuleTargetExists = exports.ensureCloudWatchRule = exports.ensureBucketPolicyAttached = exports.findBucketWithPrefix = exports.ensureBucketExists = exports.ensureInlinePolicyAttached = exports.ensurePoliciesAttached = exports.ensureRoleAdded = exports.ensureInstanceProfileExists = exports.ensureRoleExists = exports.getAccountId = exports.attachPolicies = exports.selectPlatformArn = exports.getNodeVersion = exports.getLogs = exports.createUniqueName = exports.names = exports.tmpBuildPath = exports.shouldRebuild = exports.logStreamEvent = exports.logStep = void 0;
const axios_1 = __importDefault(require("axios"));
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = __importDefault(require("fs"));
const lodash_1 = require("lodash");
const os_1 = __importDefault(require("os"));
const random_seed_1 = __importDefault(require("random-seed"));
const uuid_1 = require("uuid");
const child_process_1 = require("child_process");
const aws_1 = require("./aws");
const recheck_1 = require("./recheck");
const env_ready_1 = require("./env-ready");
function logStep(message) {
    console.log(chalk_1.default.blue(message));
}
exports.logStep = logStep;
function logStreamEvent(message) {
    console.log(chalk_1.default.dim(message));
}
exports.logStreamEvent = logStreamEvent;
function shouldRebuild(bundlePath, useCachedBuild) {
    if (fs_1.default.existsSync(bundlePath) && useCachedBuild) {
        return false;
    }
    return true;
}
exports.shouldRebuild = shouldRebuild;
function tmpBuildPath(appPath, api) {
    const rand = random_seed_1.default.create(appPath);
    const uuidNumbers = [];
    for (let i = 0; i < 16; i++) {
        uuidNumbers.push(rand(255));
    }
    return api.resolvePath(os_1.default.tmpdir(), `mup-meteor-${(0, uuid_1.v4)({ random: uuidNumbers })}`);
}
exports.tmpBuildPath = tmpBuildPath;
function names(config) {
    const name = config.app.name.toLowerCase();
    return {
        bucket: `mup-${name}`,
        environment: config.app.envName || `mup-env-${name}`,
        app: `mup-${name}`,
        bundlePrefix: `mup/bundles/${name}/`,
        instanceProfile: 'aws-elasticbeanstalk-ec2-role',
        serviceRole: 'aws-elasticbeanstalk-service-role',
        trailBucketPrefix: 'mup-graceful-shutdown-trail',
        trailName: 'mup-graceful-shutdown-trail',
        deregisterRuleName: 'mup-target-deregister',
        eventTargetRole: `mup-envoke-run-command-${name}`,
        eventTargetPolicyName: 'Invoke_Run_Command',
        eventTargetPassRoleName: 'Pass_Role',
        automationDocument: 'mup-graceful-shutdown'
    };
}
exports.names = names;
function createUniqueName(prefix = '') {
    const randomNumbers = Math.floor(Math.random() * 10000);
    return `${prefix}-${Date.now()}-${randomNumbers}`;
}
exports.createUniqueName = createUniqueName;
async function retrieveEnvironmentInfo(api, count) {
    const config = api.getConfig();
    const { environment } = names(config);
    const { EnvironmentInfo } = await aws_1.beanstalk.retrieveEnvironmentInfo({
        EnvironmentName: environment,
        InfoType: 'tail'
    });
    if (EnvironmentInfo && EnvironmentInfo.length > 0) {
        return EnvironmentInfo;
    }
    else if (count > 5) {
        throw new Error('No logs');
    }
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // The logs aren't always available, so retry until they are
            // Another option is to look for the event that says it is ready
            retrieveEnvironmentInfo(api, count + 1)
                .then(resolve)
                .catch(reject);
        }, (0, recheck_1.getRecheckInterval)());
    });
}
async function getLogs(api, logNames) {
    const config = api.getConfig();
    const { environment } = names(config);
    await (0, env_ready_1.waitForEnvReady)(config, false);
    logStep('=> Requesting Logs');
    await aws_1.beanstalk.requestEnvironmentInfo({
        EnvironmentName: environment,
        InfoType: 'tail'
    });
    const EnvironmentInfo = await retrieveEnvironmentInfo(api, 0);
    logStep('=> Downloading Logs');
    const logsForServer = EnvironmentInfo && EnvironmentInfo.reduce((result, { Ec2InstanceId, Message }) => {
        if ((0, lodash_1.isString)(Ec2InstanceId)) {
            result[Ec2InstanceId] = Message;
        }
        return result;
    }, {});
    return Promise.all(Object.keys(logsForServer).map(key => new Promise((resolve, reject) => {
        axios_1.default.get(logsForServer[key]).then(({ data }) => {
            // The separator changed with Amazon Linux 2
            let parts = data.split('----------------------------------------\n/var/log/');
            if (parts.length === 1) {
                parts = data.split('-------------------------------------\n/var/log/');
            }
            const logParts = logNames.map(name => parts.find(part => part.trim().startsWith(name)) || '');
            resolve({
                data: logParts,
                instance: key
            });
        }).catch(reject);
    })));
}
exports.getLogs = getLogs;
function getNodeVersion(api, bundlePath) {
    const starString = fs_1.default.readFileSync(api.resolvePath(bundlePath, 'bundle/star.json')).toString();
    const nodeVersionTxt = fs_1.default.readFileSync(api.resolvePath(bundlePath, 'bundle/.node_version.txt')).toString();
    const star = JSON.parse(starString);
    if (star.npmVersion) {
        return {
            nodeVersion: star.nodeVersion,
            npmVersion: star.npmVersion
        };
    }
    const nodeVersion = nodeVersionTxt.substr(1);
    if (nodeVersion.startsWith('4')) {
        return {
            nodeVersion,
            npmVersion: '4.6.1'
        };
    }
    return {
        nodeVersion,
        npmVersion: '3.10.5'
    };
}
exports.getNodeVersion = getNodeVersion;
async function selectPlatformArn() {
    const { PlatformBranchSummaryList } = await aws_1.beanstalk.listPlatformBranches({
        Filters: [{
                Attribute: 'LifecycleState',
                Operator: '=',
                Values: ['supported']
            }, {
                Attribute: 'PlatformName',
                Operator: '=',
                Values: ['Node.js']
            }, {
                Attribute: 'TierType',
                Operator: '=',
                Values: ['WebServer/Standard']
            }]
    });
    if (!PlatformBranchSummaryList || PlatformBranchSummaryList.length === 0) {
        throw new Error('Unable to find supported Node.js platform');
    }
    const branchName = PlatformBranchSummaryList[0].BranchName;
    const { PlatformSummaryList } = await aws_1.beanstalk.listPlatformVersions({
        Filters: [
            {
                Type: 'PlatformBranchName',
                Operator: '=',
                Values: [branchName]
            },
            {
                Type: 'PlatformStatus',
                Operator: '=',
                Values: ['Ready']
            }
        ]
    });
    const arn = PlatformSummaryList[0].PlatformArn;
    return arn;
}
exports.selectPlatformArn = selectPlatformArn;
async function attachPolicies(roleName, policies) {
    const promises = [];
    policies.forEach((policy) => {
        const promise = aws_1.iam.attachRolePolicy({
            RoleName: roleName,
            PolicyArn: policy
        });
        promises.push(promise);
    });
    await Promise.all(promises);
}
exports.attachPolicies = attachPolicies;
async function getAccountId() {
    const identity = await aws_1.sts.getCallerIdentity({});
    return identity.Account;
}
exports.getAccountId = getAccountId;
async function ensureRoleExists(name, assumeRolePolicyDocument, ensureAssumeRolePolicy) {
    let exists = true;
    let updateAssumeRolePolicy = false;
    try {
        const { Role } = await aws_1.iam.getRole({
            RoleName: name
        });
        const currentAssumeRolePolicy = decodeURIComponent(Role.AssumeRolePolicyDocument);
        // Make the whitespace consistent with the current document
        const consistentAssumeRolePolicyDocument = JSON.stringify(JSON.parse(assumeRolePolicyDocument));
        if (currentAssumeRolePolicy !== consistentAssumeRolePolicyDocument && ensureAssumeRolePolicy) {
            updateAssumeRolePolicy = true;
        }
    }
    catch (e) {
        exists = false;
    }
    if (!exists) {
        await aws_1.iam.createRole({
            RoleName: name,
            AssumeRolePolicyDocument: assumeRolePolicyDocument
        });
    }
    else if (updateAssumeRolePolicy) {
        await aws_1.iam.updateAssumeRolePolicy({
            RoleName: name,
            PolicyDocument: assumeRolePolicyDocument
        });
    }
}
exports.ensureRoleExists = ensureRoleExists;
async function ensureInstanceProfileExists(name) {
    let exists = true;
    try {
        await aws_1.iam.getInstanceProfile({
            InstanceProfileName: name
        });
    }
    catch (e) {
        exists = false;
    }
    if (!exists) {
        await aws_1.iam.createInstanceProfile({
            InstanceProfileName: name
        });
    }
}
exports.ensureInstanceProfileExists = ensureInstanceProfileExists;
async function ensureRoleAdded(instanceProfile, role) {
    let added = true;
    const { InstanceProfile } = await aws_1.iam.getInstanceProfile({
        InstanceProfileName: instanceProfile
    });
    if (InstanceProfile.Roles.length === 0 || InstanceProfile.Roles[0].RoleName !== role) {
        added = false;
    }
    if (!added) {
        await aws_1.iam.addRoleToInstanceProfile({
            InstanceProfileName: instanceProfile,
            RoleName: role
        });
    }
}
exports.ensureRoleAdded = ensureRoleAdded;
async function ensurePoliciesAttached(role, policies) {
    let { AttachedPolicies } = await aws_1.iam.listAttachedRolePolicies({
        RoleName: role
    });
    const arns = AttachedPolicies.map(policy => policy.PolicyArn);
    const unattachedPolicies = policies.reduce((result, policy) => {
        if (arns.indexOf(policy) === -1) {
            result.push(policy);
        }
        return result;
    }, []);
    if (unattachedPolicies.length > 0) {
        await attachPolicies(role, unattachedPolicies);
    }
}
exports.ensurePoliciesAttached = ensurePoliciesAttached;
async function ensureInlinePolicyAttached(role, policyName, policyDocument) {
    let exists = true;
    let needsUpdating = false;
    try {
        const result = await aws_1.iam.getRolePolicy({
            RoleName: role,
            PolicyName: policyName
        });
        const currentPolicyDocument = decodeURIComponent(result.PolicyDocument);
        if (currentPolicyDocument !== policyDocument) {
            needsUpdating = true;
        }
    }
    catch (e) {
        exists = false;
    }
    if (!exists || needsUpdating) {
        await aws_1.iam.putRolePolicy({
            RoleName: role,
            PolicyName: policyName,
            PolicyDocument: policyDocument
        });
    }
}
exports.ensureInlinePolicyAttached = ensureInlinePolicyAttached;
async function ensureBucketExists(buckets, bucketName, region) {
    if (!buckets.find(bucket => bucket.Name === bucketName)) {
        // @ts-ignore
        await aws_1.s3.createBucket({
            Bucket: bucketName,
            ...(region ? {
                CreateBucketConfiguration: {
                    LocationConstraint: region
                }
            } : {})
        });
        return true;
    }
}
exports.ensureBucketExists = ensureBucketExists;
function findBucketWithPrefix(buckets, prefix) {
    return buckets.find(bucket => bucket.Name.indexOf(prefix) === 0);
}
exports.findBucketWithPrefix = findBucketWithPrefix;
async function ensureBucketPolicyAttached(bucketName, policy) {
    let error = false;
    let currentPolicy;
    try {
        const { Policy } = await aws_1.s3.getBucketPolicy({ Bucket: bucketName });
        currentPolicy = Policy;
    }
    catch (e) {
        error = true;
    }
    if (error || currentPolicy !== policy) {
        const params = {
            Bucket: bucketName,
            Policy: policy
        };
        await aws_1.s3.putBucketPolicy(params);
    }
}
exports.ensureBucketPolicyAttached = ensureBucketPolicyAttached;
async function ensureCloudWatchRule(name, description, eventPattern) {
    let error = false;
    try {
        await aws_1.cloudWatchEvents.describeRule({ Name: name });
    }
    catch (e) {
        error = true;
    }
    if (error) {
        await aws_1.cloudWatchEvents.putRule({
            Name: name,
            Description: description,
            EventPattern: eventPattern
        });
        return true;
    }
    return false;
}
exports.ensureCloudWatchRule = ensureCloudWatchRule;
async function ensureRuleTargetExists(ruleName, target) {
    const { Targets } = await aws_1.cloudWatchEvents.listTargetsByRule({
        Rule: ruleName
    });
    if (!Targets.find(_target => (0, lodash_1.isEqual)(_target, target))) {
        const params = {
            Rule: ruleName,
            Targets: [target]
        };
        await aws_1.cloudWatchEvents.putTargets(params);
        return true;
    }
}
exports.ensureRuleTargetExists = ensureRuleTargetExists;
function coloredStatusText(envColor, text) {
    if (envColor === 'Green') {
        return chalk_1.default.green(text);
    }
    else if (envColor === 'Yellow') {
        return chalk_1.default.yellow(text);
    }
    else if (envColor === 'Red') {
        return chalk_1.default.red(text);
    }
    return text;
}
exports.coloredStatusText = coloredStatusText;
function createVersionDescription(api, appConfig) {
    const appPath = api.resolvePath(api.getBasePath(), appConfig.path);
    let description = '';
    try {
        description = (0, child_process_1.execSync)('git log -1 --pretty=%B', {
            cwd: appPath,
            stdio: 'pipe'
        }).toString();
    }
    catch (e) {
        description = `Deployed by Mup on ${new Date().toUTCString()}`;
    }
    return description.split('\n')[0].slice(0, 195);
}
exports.createVersionDescription = createVersionDescription;
async function ensureSsmDocument(name, content) {
    let exists = true;
    let needsUpdating = false;
    try {
        const result = await aws_1.ssm.getDocument({ Name: name, DocumentVersion: '$DEFAULT' });
        // If the document was created or edited on the AWS console, there is extra new
        // line characters and whitespace
        const currentContent = JSON.stringify(JSON.parse(result.Content.replace(/\r?\n|\r/g, '')));
        if (currentContent !== content) {
            needsUpdating = true;
        }
    }
    catch (e) {
        exists = false;
    }
    if (!exists) {
        await aws_1.ssm.createDocument({
            Content: content,
            Name: name,
            DocumentType: 'Automation'
        });
        return true;
    }
    else if (needsUpdating) {
        try {
            await aws_1.ssm.updateDocument({
                Content: content,
                Name: name,
                DocumentVersion: '$LATEST'
            });
        }
        catch (e) {
            // If the latest document version has the correct content
            // then it must not be the default version. Ignore the error
            // so we can fix the default version
            // @ts-ignore
            if (e.code !== 'DuplicateDocumentContent') {
                throw e;
            }
        }
        const result = await aws_1.ssm.getDocument({ Name: name, DocumentVersion: '$LATEST' });
        await aws_1.ssm.updateDocumentDefaultVersion({
            DocumentVersion: result.DocumentVersion,
            Name: name
        });
    }
}
exports.ensureSsmDocument = ensureSsmDocument;
async function pickInstance(config, instance) {
    const { environment } = names(config);
    const { EnvironmentResources } = await aws_1.beanstalk.describeEnvironmentResources({
        EnvironmentName: environment
    });
    const instanceIds = EnvironmentResources.Instances.map(({ Id }) => Id);
    const description = [
        'Available instances',
        ...instanceIds.map(id => `  - ${id}`)
    ].join('\n');
    return {
        selected: instanceIds.includes(instance) ? instance : null,
        description
    };
}
exports.pickInstance = pickInstance;
async function connectToInstance(api, instanceId, commandLabel) {
    const { sshKey } = api.getConfig().app;
    if (!sshKey) {
        const error = new Error('missing sshKey config');
        // @ts-ignore
        error.solution = 'Learn how to configure sshKey at https://github.com/zodern/mup-aws-beanstalk/blob/master/docs/index.md#meteor-shell-and-debug';
        throw error;
    }
    const { Reservations } = await aws_1.ec2.describeInstances({
        InstanceIds: [
            instanceId
        ]
    });
    const instance = Reservations[0].Instances[0];
    const availabilityZone = instance.Placement.AvailabilityZone;
    const securityGroups = instance.SecurityGroups.map(g => g.GroupId);
    let { data: ipAddress } = await axios_1.default.get('https://ipv4.icanhazip.com');
    ipAddress = ipAddress.trim();
    if (securityGroups.length > 1) {
        console.warn('Instance has more than one security group. Please open a GitHub issue for mup-aws-beanstalk');
    }
    let ruleIds = [];
    try {
        const { SecurityGroupRules } = await aws_1.ec2.authorizeSecurityGroupIngress({
            GroupId: securityGroups[0],
            IpPermissions: [
                {
                    FromPort: 22,
                    IpProtocol: 'tcp',
                    IpRanges: [
                        {
                            CidrIp: `${ipAddress}/32`,
                            Description: `Temporary SSH access for ${commandLabel}`
                        }
                    ],
                    ToPort: 22
                }
            ]
        });
        ruleIds = SecurityGroupRules.map(rule => rule.SecurityGroupRuleId);
    }
    catch (e) {
        // @ts-ignore
        if (e.code === 'InvalidPermission.Duplicate') {
            // This rule already exists
            // TODO: should we find the rule id so we can remove it, or leave it in
            // case the user had manually added this rule?
        }
        else {
            throw e;
        }
    }
    await aws_1.ec2InstanceConnect.sendSSHPublicKey({
        InstanceId: instanceId,
        AvailabilityZone: availabilityZone,
        InstanceOSUser: 'ec2-user',
        SSHPublicKey: fs_1.default.readFileSync(api.resolvePath(sshKey.publicKey), 'utf-8')
    });
    const sshOptions = {
        host: instance.PublicDnsName,
        port: 22,
        username: 'ec2-user',
        privateKey: fs_1.default.readFileSync(api.resolvePath(sshKey.privateKey), 'utf-8')
    };
    return {
        sshOptions,
        removeSSHAccess() {
            if (ruleIds.length === 0) {
                return;
            }
            console.log('Removing temporary security group rule for SSH');
            return aws_1.ec2.revokeSecurityGroupIngress({
                GroupId: securityGroups[0],
                SecurityGroupRuleIds: ruleIds
            });
        }
    };
}
exports.connectToInstance = connectToInstance;
async function executeSSHCommand(conn, command) {
    return new Promise((resolve, reject) => {
        conn.exec(command, (err, outputStream) => {
            if (err) {
                conn.end();
                reject(err);
                return;
            }
            let output = '';
            outputStream.on('data', (data) => {
                output += data;
            });
            outputStream.stderr.on('data', (data) => {
                output += data;
            });
            outputStream.once('close', (code) => {
                conn.end();
                resolve({ code, output });
            });
        });
    });
}
exports.executeSSHCommand = executeSSHCommand;
//# sourceMappingURL=utils.js.map