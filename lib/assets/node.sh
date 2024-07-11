#!/bin/bash
NODE_VERSION=<%= nodeVersion %>
NPM_VERSION=<%= npmVersion %>
MAJOR_NODE_VERSION=`echo $NODE_VERSION | awk -F. '{print $1}'`
MINOR_NODE_VERSION=`echo $NODE_VERSION | awk -F. '{print $2}'`
METEOR_VERSION=<%= meteorVersion %>

echo "Node: $NODE_VERSION"
echo "Major: $MAJOR_NODE_VERSION"
echo "Minor: $MINOR_NODE_VERSION"

if [[ $MAJOR_NODE_VERSION == "14" && $MINOR_NODE_VERSION -ge 21 ]]; then
  ENV_PATH=/tmp/node_env.sh
  touch $ENV_PATH
  source $ENV_PATH

  if [[ $(node --version) == $INSTALLED_NODE_VERSION ]]; then
    echo "The correct Node version is already installed ($(node --version))"
  else
    echo "Using Meteor's custom NodeJS v14 LTS version"
    # https://hub.docker.com/layers/meteor/node/14.21.4/images/sha256-f4e19b4169ff617118f78866c2ffe392a7ef44d4e30f2f9fc31eef2c35ceebf3?context=explore
    curl "https://static.meteor.com/dev-bundle-node-os/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" | tar xzf - -C ./
    
    NEW_PATH="./node-v$NODE_VERSION-linux-x64/bin"
    
    ln -s $NEW_PATH/node ./node
    ln -s $NEW_PATH/npm ./npm
    
    # Save the new config to all environments
    echo "export PATH=$NEW_PATH:\$PATH" >> $ENV_PATH
    echo ". $ENV_PATH" >> ~/.shinit
    echo ". $ENV_PATH" >> ~/.bashrc
    . $ENV_PATH
    
    # Save installed Node version
    echo "export INSTALLED_NODE_VERSION=$(node --version)" >> $ENV_PATH
    
    # Set Node path for start.sh
    export NODE_PATH=$NEW_PATH
  fi
else
  export NVM_DIR="/.nvm"
  # Install nvm
  curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.6/install.sh | bash
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  nvm install $NODE_VERSION
  nvm use $NODE_VERSION
  nvm alias default $NODE_VERSION
  npm i -g npm@$NPM_VERSION
  
    # Create symlinks to nvm binaries
  ln -sf "$NVM_DIR/versions/node/$(nvm version)/bin/node" ./node
  ln -sf "$NVM_DIR/versions/node/$(nvm version)/bin/npm" ./npm
fi

APP_PATH="$(/opt/elasticbeanstalk/bin/get-config container -k app_staging_dir)"
echo "APP_PATH: $APP_PATH"

# AWS Linux 2
[[ -z "$APP_PATH" ]] && APP_PATH="$(/opt/elasticbeanstalk/bin/get-config platformconfig -k AppStagingDir)"
echo "APP_PATH: $APP_PATH"

cd "$APP_PATH"

cd programs/server && ../../npm install --unsafe-perm
