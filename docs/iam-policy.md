# IAM Policy for Meteor Up AWS Beanstalk Deployment

Required IAM policies for deploying Meteor applications using `mup-aws-beanstalk`.

## Required Policies

### AWS Managed Policies

Attach these AWS managed policies to your IAM user or role:

1. **`AdministratorAccess-AWSElasticBeanstalk`**
2. **`AmazonS3FullAccess`**
3. **`IAMFullAccess`**
4. **`AWSCertificateManagerFullAccess`**
5. **`CloudWatchLogsReadOnlyAccess`**

### Inline Policy (Account Verification)

Create this inline policy named `MeteorMupAccountVerification`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AccountVerification",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "account:GetAccountInformation",
        "organizations:DescribeAccount",
        "iam:ListAccountAliases"
      ],
      "Resource": "*"
    }
  ]
}
```

## Setup via AWS Console

1. **IAM → Users → Create user** (`meteor-deploy`)
2. **Attach the 5 managed policies** listed above
3. **Add inline policy** with the JSON above
4. **Create access key** and save credentials

## Setup via AWS CLI

```bash
# Create user
aws iam create-user --user-name meteor-deploy

# Attach managed policies
aws iam attach-user-policy --user-name meteor-deploy \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess-AWSElasticBeanstalk

aws iam attach-user-policy --user-name meteor-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

aws iam attach-user-policy --user-name meteor-deploy \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess

aws iam attach-user-policy --user-name meteor-deploy \
  --policy-arn arn:aws:iam::aws:policy/AWSCertificateManagerFullAccess

aws iam attach-user-policy --user-name meteor-deploy \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsReadOnlyAccess

# Add inline policy
cat > account-verification.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AccountVerification",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "account:GetAccountInformation",
        "organizations:DescribeAccount",
        "iam:ListAccountAliases"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-user-policy --user-name meteor-deploy \
  --policy-name MeteorMupAccountVerification \
  --policy-document file://account-verification.json

# Create access key
aws iam create-access-key --user-name meteor-deploy
```

## Configure Mup

### With Access Keys

```js
module.exports = {
  app: {
    type: 'aws-beanstalk',
    name: 'my-app',
    awsAccountName: 'production-account', // Required
    auth: {
      id: 'YOUR_ACCESS_KEY_ID',
      secret: 'YOUR_SECRET_ACCESS_KEY'
    }
  }
}
```

### With AWS Profile/SSO

```js
module.exports = {
  app: {
    type: 'aws-beanstalk',
    name: 'my-app',
    awsAccountName: 'production-account', // Required
    auth: {
      profile: 'my-aws-profile'
    }
  }
}
```

Login before deploying:
```bash
mup beanstalk login
```

## Security Best Practices

- Use separate IAM users per environment (dev, staging, production)
- Enable MFA on deployment users
- Rotate access keys every 90 days
- Use AWS SSO instead of long-lived keys when possible
- Always set `awsAccountName` to prevent wrong-account deployments

## Troubleshooting

**Access Denied:**
```bash
aws iam list-attached-user-policies --user-name meteor-deploy
aws iam list-user-policies --user-name meteor-deploy
```

**Account Verification Fails:**
```bash
aws account get-account-information
aws sts get-caller-identity
```

**SSO Session Expired:**
```bash
mup beanstalk login
```

## Related Documentation

- [Getting Started Guide](./getting-started.md)
- [Configuration Reference](./index.md)


