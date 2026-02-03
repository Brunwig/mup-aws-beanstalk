# Quick Start: Using AWS Profiles

## TL;DR

Instead of:
```js
auth: {
  id: 'YOUR_ACCESS_KEY',
  secret: 'YOUR_SECRET_KEY'
}
```

You can now use:
```js
auth: {
  profile: 'my-profile'
}
```

## Setup Steps

### 1. Configure AWS CLI Profile

Create or edit `~/.aws/credentials`:
```ini
[my-profile]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
region = us-east-1
```

### 2. Update Your Mup Config

Edit `.deploy/mup.js`:
```js
module.exports = {
  app: {
    type: 'aws-beanstalk',
    name: 'myApp',
    path: '../',
    
    auth: {
      profile: 'my-profile'  // ← Use your profile name
    },
    
    env: {
      ROOT_URL: 'http://app.com',
      MONGO_URL: 'mongodb://...'
    },
    
    region: 'us-east-1',
    awsPlatformBranchName: 'Node.js 20',
    minInstances: 1
  },
  plugins: ['@brunwig/mup-aws-beanstalk']
};
```

### 3. Deploy

```bash
mup deploy
```

That's it! The plugin will use credentials from your AWS profile.

## Multiple Profiles

Switch between environments easily:

```js
// Production
auth: { profile: 'production' }

// Staging
auth: { profile: 'staging' }

// Development
auth: { profile: 'development' }
```

## Troubleshooting

**Error: "Either auth.profile or auth credentials must be provided"**
- Make sure you have either `profile` OR both `id` and `secret` in your auth object

**Error: "Unable to locate credentials"**
- Check that your profile exists in `~/.aws/credentials`
- Verify the profile name matches exactly (case-sensitive)

**Error: "The security token included in the request is invalid"**
- Your AWS credentials may be expired (common with SSO)
- Run `aws sso login --profile my-profile` to refresh
