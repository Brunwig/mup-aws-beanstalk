#!/bin/bash
export NVM_DIR="/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

APP_PATH="$(/opt/elasticbeanstalk/bin/get-config container -k app_staging_dir)"
echo "APP_PATH: $APP_PATH"

# AWS Linux 2 /2023
[[ -z "$APP_PATH" ]] && APP_PATH="$(/opt/elasticbeanstalk/bin/get-config platformconfig -k AppStagingDir)"
echo "APP_PATH: $APP_PATH"

cd "$APP_PATH"
ls
cd programs/server && npm install --unsafe-perm
