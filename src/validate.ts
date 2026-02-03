import joi from 'joi';
import { STS } from '@aws-sdk/client-sts';
import { IAM } from '@aws-sdk/client-iam';
import { Organizations, DescribeAccountCommand } from '@aws-sdk/client-organizations';
import { Account, GetAccountInformationCommand } from '@aws-sdk/client-account';
import { MupUtils, MupConfig } from "./types";

const schema = joi.object().keys({
  name: joi.string().min(1).required(),
  path: joi.string().min(1).required(),
  type: joi.string().required(),
  envName: joi.string().min(1),
  envType: joi.string().valid('webserver', 'worker'),
  buildOptions: joi.object().keys({
    serverOnly: joi.bool(),
    debug: joi.bool(),
    buildLocation: joi.string(),
    mobileSettings: joi.object(),
    server: joi.string().uri(),
    allowIncompatibleUpdates: joi.boolean(),
    executable: joi.string()
  }),
  // The meteor plugin adds the docker object, which is a bug in mup
  docker: joi.object(),
  env: joi.object(),
  auth: joi.object().keys({
    id: joi.string(),
    secret: joi.string(),
    profile: joi.string()
  }).required(),
  sslDomains: joi.array().items(joi.string()),
  forceSSL: joi.bool(),
  streamLogs: joi.bool(),
  region: joi.string(),
  minInstances: joi.number().min(1).required(),
  maxInstances: joi.number().min(1),
  instanceType: joi.string(),
  gracefulShutdown: joi.bool(),
  longEnvVars: joi.bool(),
  requireInstanceRole: joi.bool(),
  yumPackages: joi.object().pattern(
    /[/s/S]*/,
    [joi.string().allow('')]
  ),
  oldVersions: joi.number(),
  customBeanstalkConfig: joi.array().items(joi.object({
    namespace: joi.string().trim().required(),
    resource: joi.string().trim().optional(),
    option: joi.string().trim().required(),
    value: joi.string().trim().required()
  })),
  sshKey: {
    privateKey: joi.string().required(),
    publicKey: joi.string().required()
  },
  awsPlatformBranchName: joi.string().min(1).required(),
  awsAccountName: joi.string().min(1).required()
});

export default async function (config: MupConfig, utils: MupUtils) {
  let details: { message: string, path: string }[] = [];

  details = utils.combineErrorDetails(
    details,
    schema.validate(config.app, utils.VALIDATE_OPTIONS)
  );

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

export async function verifyAwsAccount(config: MupConfig) {
  if (!config.app || config.app.type !== 'aws-beanstalk') {
    return;
  }

  const hasProfile = config.app.auth?.profile && config.app.auth.profile.length > 0;
  const hasCredentials = config.app.auth?.id && 
                        config.app.auth.id.length > 0 &&
                        config.app.auth?.secret && 
                        config.app.auth.secret.length > 0;

  if (hasProfile || hasCredentials) {
    await printAwsAccountInfo(config);
  }
}

async function printAwsAccountInfo(config: MupConfig) {
  const commonOptions = {
    credentials: config.app.auth.profile ? undefined : {
      accessKeyId: config.app.auth.id!,
      secretAccessKey: config.app.auth.secret!,
    },
    region: config.app.region || 'us-east-1'
  };

  // Set AWS_PROFILE environment variable if profile is specified
  if (config.app.auth.profile) {
    process.env.AWS_PROFILE = config.app.auth.profile;
  }

  const sts = new STS(commonOptions);
  const iam = new IAM(commonOptions);
  const organizations = new Organizations(commonOptions);
  const account = new Account(commonOptions);

  // Get caller identity (account ID, user ARN, etc.)
  const identity = await sts.getCallerIdentity({});
  const accountId = identity.Account!;
  
  const expectedAccountName = config.app.awsAccountName;
  let actualAccountName: string | undefined;
  let accountCreatedDate: Date | string | undefined;
  let accountEmail: string | undefined;
  let accountAlias: string | undefined;
  let organizationJoinedDate: string | undefined;

  // Try to get account information using the Account Management API (best option)
  try {
    const accountInfo = await account.send(new GetAccountInformationCommand({}));
    if (accountInfo.AccountName) {
      actualAccountName = accountInfo.AccountName;
    }
    if (accountInfo.AccountCreatedDate) {
      accountCreatedDate = accountInfo.AccountCreatedDate;
    }
  } catch (error: any) {
    // Try Organizations API as fallback
    try {
      const accountInfo = await organizations.send(new DescribeAccountCommand({
        AccountId: accountId
      }));
      if (accountInfo.Account?.Name) {
        actualAccountName = accountInfo.Account.Name;
      }
      if (accountInfo.Account?.Email) {
        accountEmail = accountInfo.Account.Email;
      }
      if (accountInfo.Account?.JoinedTimestamp) {
        organizationJoinedDate = accountInfo.Account.JoinedTimestamp.toISOString();
      }
    } catch (orgError: any) {
      // Could not get account name from either API
    }
  }

  // Try to get account alias
  try {
    const aliases = await iam.listAccountAliases({});
    if (aliases.AccountAliases && aliases.AccountAliases.length > 0) {
      accountAlias = aliases.AccountAliases[0];
    }
  } catch (error: any) {
    // Ignore alias errors
  }

  // Check if account name matches
  const accountNameMatches = actualAccountName === expectedAccountName;

  if (accountNameMatches) {
    // Account name matches - print minimal info
    console.log('\n✅ AWS Account Verification:');
    console.log(`   Account Name: ${actualAccountName} (matches expected)`);
    console.log('');
  } else {
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
    } else {
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
