#!/bin/bash

export NVM_DIR="/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm use default --delete-prefix --silent

[[ ! -z "$MUP_ENV_FILE_VERSION" ]] && { echo "Long Env is enabled."; source /etc/app/env.txt; }

echo "Node version"
echo $(node --version)
echo "Npm version"
echo $(npm --version)
# Check if meteor-settings.js exists and prepend METEOR_SETTINGS to main.js
SETTINGS_FILE="./programs/server/assets/app/meteor-settings.js"
MAIN_JS="./main.js"
TEMP_MAIN_JS="./main_temp.js"

if [ -f "$SETTINGS_FILE" ]; then
    echo "Found settings file"
     
    # Prepend the require statement to main.js
    echo "Requiring settings.js in main.js"
    echo "require('$SETTINGS_FILE');" > "$TEMP_MAIN_JS"
    cat "$MAIN_JS" >> "$TEMP_MAIN_JS"
    mv "$TEMP_MAIN_JS" "$MAIN_JS"
else
    export METEOR_SETTINGS=$(node -e 'console.log(decodeURIComponent(process.env.METEOR_SETTINGS_ENCODED))')
fi


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

# Update all environment variables
if [ -f /etc/environment ]; then
    echo "Updating environment variables from /etc/environment"
    set -a  # Automatically export all variables
    source /etc/environment
    set +a
else
    echo "/etc/environment file not found."
fi

echo "INSTANCE_ROLE is set to '$INSTANCE_ROLE'"
echo "FIRST_INSTANCE is set to '$FIRST_INSTANCE'"
echo "=> Starting health check server"
node health-check.js &
echo "=> Starting App"
node main.js