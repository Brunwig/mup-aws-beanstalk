import joi from 'joi';
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
  awsPlatformBranchName: joi.string().min(1).required()
});

export default function (config: MupConfig, utils: MupUtils) {
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
