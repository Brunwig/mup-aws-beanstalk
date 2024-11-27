"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectFiles = injectFiles;
exports.archiveApp = archiveApp;
const archiver_1 = __importDefault(require("archiver"));
const fs_1 = __importDefault(require("fs"));
const ejs_1 = __importDefault(require("ejs"));
const lodash_1 = require("lodash");
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
function copyFolderSync(src, dest) {
    if (!fs_1.default.existsSync(src))
        return;
    if (!fs_1.default.existsSync(dest))
        fs_1.default.mkdirSync(dest, { recursive: true });
    fs_1.default.readdirSync(src).forEach((dirent) => {
        const [srcPath, destPath] = [src, dest].map(dirPath => path_1.default.join(dirPath, dirent));
        const stat = fs_1.default.lstatSync(srcPath);
        switch (true) {
            case stat.isFile():
                console.log(` ... copying  ${srcPath} ${destPath}`);
                fs_1.default.copyFileSync(srcPath, destPath);
                break;
            case stat.isDirectory():
                copyFolderSync(srcPath, destPath);
                break;
            default:
                break;
        }
    });
}
function copy(source, destination, vars = {}) {
    let contents = fs_1.default.readFileSync(source).toString();
    contents = ejs_1.default.render(contents, {
        ...vars,
        padScript(content, spaces) {
            const padding = ''.padStart(spaces, ' ');
            return content.split('\n').map(line => padding + line).join('\n');
        }
    }, {
        filename: source
    });
    fs_1.default.writeFileSync(destination, contents);
}
function injectFiles(api, name, version, appConfig) {
    const { yumPackages, forceSSL, gracefulShutdown, buildOptions, longEnvVars, path: appPath } = appConfig;
    const bundlePath = buildOptions.buildLocation;
    const { bucket } = (0, utils_1.names)({ app: appConfig });
    let sourcePath = api.resolvePath(__dirname, './assets/package.json');
    let destPath = api.resolvePath(bundlePath, 'bundle/package.json');
    copy(sourcePath, destPath, {
        name,
        version
    });
    sourcePath = api.resolvePath(__dirname, './assets/npmrc');
    destPath = api.resolvePath(bundlePath, 'bundle/.npmrc');
    copy(sourcePath, destPath);
    //merge with our custom settings
    let appNpmrcPath = api.resolvePath(api.getBasePath(), `${appPath}/.npmrc`);
    try {
        let originalNpmrcContent = fs_1.default.readFileSync(appNpmrcPath).toString();
        if (originalNpmrcContent) {
            console.log('  Merging custom npmrc', appNpmrcPath);
        }
        fs_1.default.appendFileSync(destPath, '\n' + originalNpmrcContent);
    }
    catch (err) {
        //doesn't exist ignore
    }
    sourcePath = api.resolvePath(__dirname, './assets/start.sh');
    destPath = api.resolvePath(bundlePath, 'bundle/start.sh');
    copy(sourcePath, destPath);
    [
        '.ebextensions',
        '.platform',
        '.platform/hooks',
        '.platform/hooks/prebuild',
        '.platform/confighooks',
        '.platform/confighooks/prebuild',
        '.platform/nginx',
        '.platform/nginx/conf.d',
        '.platform/nginx/conf.d/elasticbeanstalk',
        'node_modules'
    ].forEach((folder) => {
        try {
            fs_1.default.mkdirSync(api.resolvePath(bundlePath, 'bundle', folder));
        }
        catch (e) {
            // @ts-ignore
            if (e.code !== 'EEXIST') {
                throw e;
            }
        }
    });
    // For some resources we make two copies of scripts:
    // 1) In .platform/hooks. These are used in AWS Linux 2
    // 2) as part of a config file in .ebextensions for older platforms
    const { nodeVersion, npmVersion, meteorVersion } = (0, utils_1.getNodeVersion)(api, bundlePath);
    /* DEPRECATED
    sourcePath = api.resolvePath(__dirname, './assets/node.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/node.config');
     copy(sourcePath, destPath, { nodeVersion, npmVersion, meteorVersion });
     */
    sourcePath = api.resolvePath(__dirname, './assets/node.sh');
    destPath = api.resolvePath(bundlePath, 'bundle/.platform/hooks/prebuild/45node.sh');
    copy(sourcePath, destPath, { nodeVersion, npmVersion, meteorVersion });
    destPath = api.resolvePath(bundlePath, 'bundle/.platform/confighooks/prebuild/45node.sh');
    copy(sourcePath, destPath, { nodeVersion, npmVersion, meteorVersion });
    sourcePath = api.resolvePath(__dirname, './assets/nginx.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/nginx.config');
    copy(sourcePath, destPath, { forceSSL });
    sourcePath = api.resolvePath(__dirname, './assets/nginx-server.conf');
    destPath = api.resolvePath(bundlePath, 'bundle/.platform/nginx/conf.d/elasticbeanstalk/00_application.conf');
    copy(sourcePath, destPath, { forceSSL });
    if (yumPackages) {
        sourcePath = api.resolvePath(__dirname, './assets/packages.yaml');
        destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/packages.config');
        copy(sourcePath, destPath, { packages: yumPackages });
    }
    if (gracefulShutdown) {
        sourcePath = api.resolvePath(__dirname, './assets/graceful_shutdown.yaml');
        destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/graceful_shutdown.config');
        copy(sourcePath, destPath);
        sourcePath = api.resolvePath(__dirname, './assets/graceful_shutdown.sh');
        destPath = api.resolvePath(bundlePath, 'bundle/.platform/hooks/prebuild/48graceful_shutdown.sh');
        copy(sourcePath, destPath);
        destPath = api.resolvePath(bundlePath, 'bundle/.platform/confighooks/prebuild/48graceful_shutdown.sh');
        copy(sourcePath, destPath);
    }
    if (longEnvVars) {
        sourcePath = api.resolvePath(__dirname, './assets/env.yaml');
        destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/env.config');
        copy(sourcePath, destPath, {
            bucketName: bucket
        });
        sourcePath = api.resolvePath(__dirname, './assets/env.sh');
        destPath = api.resolvePath(bundlePath, 'bundle/.platform/hooks/prebuild/47env.sh');
        copy(sourcePath, destPath, {
            bucketName: bucket
        });
        destPath = api.resolvePath(bundlePath, 'bundle/.platform/confighooks/prebuild/47env.sh');
        copy(sourcePath, destPath, {
            bucketName: bucket
        });
    }
    sourcePath = api.resolvePath(__dirname, './assets/health-check.js');
    destPath = api.resolvePath(bundlePath, 'bundle/health-check.js');
    copy(sourcePath, destPath);
    sourcePath = api.resolvePath(__dirname, './assets/.placeholder');
    destPath = api.resolvePath(bundlePath, 'bundle/node_modules/.placeholder');
    copy(sourcePath, destPath);
    let customConfigPath = api.resolvePath(api.getBasePath(), `${appPath}/.ebextensions`);
    let customConfig = fs_1.default.existsSync(customConfigPath);
    if (customConfig) {
        console.log('  Copying files from project .ebextensions folder');
        fs_1.default.readdirSync(customConfigPath).forEach((file) => {
            sourcePath = api.resolvePath(customConfigPath, file);
            destPath = api.resolvePath(bundlePath, `bundle/.ebextensions/${file}`);
            copy(sourcePath, destPath);
        });
    }
    customConfigPath = api.resolvePath(api.getBasePath(), `${appPath}/.platform`);
    customConfig = fs_1.default.existsSync(customConfigPath);
    if (customConfig) {
        console.log('  Copying files from project .platform folder');
        copyFolderSync(customConfigPath, api.resolvePath(bundlePath, 'bundle/.platform'));
    }
}
function archiveApp(buildLocation, api) {
    const bundlePath = api.resolvePath(buildLocation, 'bundle.zip');
    try {
        fs_1.default.unlinkSync(bundlePath);
    }
    catch (e) {
        // empty
    }
    return new Promise((resolve, reject) => {
        (0, utils_1.logStep)('=> Archiving Bundle');
        const sourceDir = api.resolvePath(buildLocation, 'bundle');
        const output = fs_1.default.createWriteStream(bundlePath);
        const archive = (0, archiver_1.default)('zip', {
            gzip: true,
            gzipOptions: {
                level: 9
            }
        });
        archive.pipe(output);
        output.once('close', resolve);
        archive.once('error', (err) => {
            (0, utils_1.logStep)(`=> Archiving failed: ${err.message}`);
            reject(err);
        });
        let nextProgress = 0.1;
        archive.on('progress', ({ entries }) => {
            try {
                const progress = entries.processed / entries.total;
                if (progress > nextProgress) {
                    console.log(`  ${(0, lodash_1.round)(Math.floor(nextProgress * 100), -1)}% Archived`);
                    nextProgress += 0.1;
                }
            }
            catch (e) {
                console.log(e);
            }
        });
        archive.directory(sourceDir, false, (entry) => {
            if (entry.name.startsWith('.platform/hooks/')) {
                // Hooks must be executable for AWS Beanstalk to run them
                // Windows doesn't have a way to make a file be executable, so we
                // set it in the zip file
                entry.mode = 0o777;
            }
            return entry;
        }).finalize();
    });
}
//# sourceMappingURL=prepare-bundle.js.map