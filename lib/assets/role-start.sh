#!/bin/bash

export NVM_DIR="/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm use default --delete-prefix --silent

[[ ! -z "$MUP_ENV_FILE_VERSION" ]] && { echo "Long Env is enabled."; source /etc/app/env.txt; }

echo "Node version"
echo $(node --version)
echo "Npm version"
echo $(npm --version)
echo "=> Starting health check server"
node health-check.js &

export METEOR_SETTINGS=$(node -e 'console.log(decodeURIComponent(process.env.METEOR_SETTINGS_ENCODED))')

MAX_WAIT=60  # Timeout in seconds
WAITED=0
while [ -z "$INSTANCE_ROLE" ]; do
    INSTANCE_ROLE=$(grep '^INSTANCE_ROLE=' /etc/environment | cut -d '=' -f2)
    sleep 1
    WAITED=$((WAITED + 1))
    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "Timeout: INSTANCE_ROLE not set after $MAX_WAIT seconds. Exiting."
        exit 1
    else
        echo "Waited $WAITED seconds for INSTANCE_ROLE to be set..."
    fi
done
export INSTANCE_ROLE
echo "INSTANCE_ROLE is set to '$INSTANCE_ROLE'"

echo "=> Starting App"
node main.js