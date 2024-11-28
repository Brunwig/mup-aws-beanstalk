#!/bin/bash
npm i -g corepack # <- Add this line to install corepack first

corepack enable
APP_PATH="$(/opt/elasticbeanstalk/bin/get-config container -k app_staging_dir)"
echo "APP_PATH: $APP_PATH"

# AWS Linux 2 /2023
[[ -z "$APP_PATH" ]] && APP_PATH="$(/opt/elasticbeanstalk/bin/get-config platformconfig -k AppStagingDir)"
echo "APP_PATH: $APP_PATH"

cd "$APP_PATH"
ls
cd programs/server
yarn set version 1.x
yarn config set unsafe-perm true
yarn install