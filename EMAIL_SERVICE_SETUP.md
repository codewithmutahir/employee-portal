# Email Service Setup Guide

## Overview

The Employee Portal uses **Nodemailer** with SMTP for sending emails. Currently implemented for:
- Birthday reminder notifications (sent daily at 9 AM)

## Current Configuration

**Service**: Nodemailer (SMTP)  
**Location**: Firebase Cloud Functions (`functions/index.js`)  
**Dependencies**: `nodemailer` v6.9.7 (installed in `functions/package.json`)

---

## 🚀 Quick Setup (Gmail)

### Prerequisites
- Gmail account with 2-Step Verification enabled
- Firebase CLI installed
- Firebase project initialized

### Step-by-Step Setup

#### 1. Generate Gmail App Password

1. Go to Google Account Settings: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification** (enable if not already)
3. Search for **"App passwords"** at the bottom
4. Click **"Select app"** → Choose **"Mail"**
5. Click **"Select device"** → Choose **"Other"** → Type "Employee Portal"
6. Click **Generate**
7. **Copy the 16-character password** (you won't see it again!)

#### 2. Configure Firebase Functions

Open terminal and navigate to your project root:

```bash
# Navigate to functions directory
cd functions

# Set Gmail SMTP configuration
firebase functions:config:set email.host="smtp.gmail.com"
firebase functions:config:set email.port="587"
firebase functions:config:set email.user="your-email@gmail.com"
firebase functions:config:set email.pass="your-16-character-app-password"

# Set recipient email for birthday reminders (usually HR email)
firebase functions:config:set reminders.email="hr@yourcompany.com"

# Verify configuration (optional)
firebase functions:config:get

# Deploy functions to apply changes
firebase deploy --only functions
```

#### 3. Test the Configuration

The birthday reminder function runs automatically daily at 9 AM EST. To test immediately:

```bash
# Deploy functions
firebase deploy --only functions

# Check logs
firebase functions:log
```

---

## 📧 Alternative SMTP Providers

### SendGrid (Recommended for Production)

**Advantages**: High deliverability, detailed analytics, generous free tier (100 emails/day)

**Setup**:
1. Sign up at https://sendgrid.com/
2. Create an API key from **Settings** → **API Keys**
3. Configure:

```bash
firebase functions:config:set email.host="smtp.sendgrid.net"
firebase functions:config:set email.port="587"
firebase functions:config:set email.user="apikey"
firebase functions:config:set email.pass="YOUR_SENDGRID_API_KEY"
firebase functions:config:set reminders.email="hr@yourcompany.com"
```

**Free Tier**: 100 emails/day

---

### Mailgun

**Advantages**: Developer-friendly, good documentation, powerful API

**Setup**:
1. Sign up at https://www.mailgun.com/
2. Add and verify your sending domain
3. Get SMTP credentials from **Sending** → **Domain settings** → **SMTP credentials**
4. Configure:

```bash
firebase functions:config:set email.host="smtp.mailgun.org"
firebase functions:config:set email.port="587"
firebase functions:config:set email.user="YOUR_MAILGUN_SMTP_USERNAME"
firebase functions:config:set email.pass="YOUR_MAILGUN_SMTP_PASSWORD"
firebase functions:config:set reminders.email="hr@yourcompany.com"
```

**Free Tier**: 5,000 emails/month for 3 months

---

### Amazon SES (AWS Simple Email Service)

**Advantages**: Cost-effective for high volume, reliable infrastructure

**Setup**:
1. Sign up for AWS account
2. Navigate to SES console: https://console.aws.amazon.com/ses/
3. Verify your email/domain
4. Create SMTP credentials from **SMTP Settings**
5. Configure:

```bash
firebase functions:config:set email.host="email-smtp.us-east-1.amazonaws.com"
firebase functions:config:set email.port="587"
firebase functions:config:set email.user="YOUR_AWS_SMTP_USERNAME"
firebase functions:config:set email.pass="YOUR_AWS_SMTP_PASSWORD"
firebase functions:config:set reminders.email="hr@yourcompany.com"
```

**Pricing**: $0.10 per 1,000 emails (very cost-effective)

---

### Outlook/Microsoft 365

**Advantages**: Good if you already use Microsoft 365 for business

**Setup**:
```bash
firebase functions:config:set email.host="smtp.office365.com"
firebase functions:config:set email.port="587"
firebase functions:config:set email.user="your-email@outlook.com"
firebase functions:config:set email.pass="YOUR_PASSWORD"
firebase functions:config:set reminders.email="hr@yourcompany.com"
```

**Note**: May require app password if 2FA is enabled

---

## 🔧 Configuration Reference

### Current Email Settings

The system reads configuration from Firebase Functions config:

| Config Key | Description | Default | Required |
|------------|-------------|---------|----------|
| `email.host` | SMTP server hostname | `smtp.gmail.com` | Yes |
| `email.port` | SMTP server port | `587` | Yes |
| `email.user` | SMTP username/email | - | Yes |
| `email.pass` | SMTP password/API key | - | Yes |
| `reminders.email` | Recipient for birthday reminders | `hr@company.com` | Yes |

### View Current Configuration

```bash
firebase functions:config:get
```

### Update Configuration

```bash
# Update single value
firebase functions:config:set email.user="newemail@gmail.com"

# Update multiple values
firebase functions:config:set email.user="newemail@gmail.com" email.pass="newpassword"

# Delete configuration
firebase functions:config:unset email.user
```

---

## 📅 Birthday Reminder Feature

### How It Works

1. **Schedule**: Runs daily at 9:00 AM Eastern Time
2. **Check Window**: Looks for birthdays in the next 7 days
3. **Filter**: Only active employees with `dateOfBirth` set
4. **Email**: Sends summary to HR email (`reminders.email`)

### Email Format

**Subject**: Upcoming Employee Birthdays

**Content**: Lists employees with:
- Employee name
- Employee email
- Birthday date

### Example Email

```
Upcoming Employee Birthdays

The following employees have birthdays in the next 7 days:

• John Doe (john.doe@company.com) - January 15
• Jane Smith (jane.smith@company.com) - January 18
• Bob Wilson (bob.wilson@company.com) - January 20
```

### Manual Testing

To test the birthday reminder without waiting:

1. Deploy the function:
```bash
firebase deploy --only functions
```

2. Add test employees with upcoming birthdays in Firestore

3. Check logs:
```bash
firebase functions:log
```

---

## 🔒 Security Best Practices

### For Gmail
- ✅ Use app-specific passwords (never your actual Gmail password)
- ✅ Enable 2-Step Verification
- ✅ Revoke app passwords you no longer use

### For All Providers
- ✅ Never commit email credentials to version control
- ✅ Use environment-specific configurations
- ✅ Rotate passwords/API keys periodically
- ✅ Monitor email sending logs for suspicious activity
- ✅ Set up SPF, DKIM, and DMARC records for your domain

---

## 🐛 Troubleshooting

### Email Not Sending

**Check Firebase Functions logs**:
```bash
firebase functions:log
```

**Common Issues**:

1. **Invalid credentials**
   - Verify email.user and email.pass are correct
   - For Gmail, ensure you're using app password (not regular password)
   - Check if 2FA is enabled and app password is generated

2. **SMTP connection refused**
   - Verify email.host and email.port are correct
   - Check if firewall blocks SMTP ports

3. **Authentication failed**
   - Gmail: Ensure "Less secure app access" is NOT needed (use app passwords)
   - Verify username/password combination

4. **Function not deployed**
   - Run `firebase deploy --only functions`
   - Wait a few minutes for deployment to complete

### Test Email Configuration Locally

Create a test script in `functions/test-email.js`:

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password',
  },
});

transporter.sendMail({
  from: 'your-email@gmail.com',
  to: 'recipient@example.com',
  subject: 'Test Email',
  text: 'This is a test email from Employee Portal',
}, (error, info) => {
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Email sent:', info.response);
  }
});
```

Run it:
```bash
cd functions
node test-email.js
```

### View Function Execution

```bash
# View recent logs
firebase functions:log

# Stream logs in real-time
firebase functions:log --follow
```

---

## 📊 Current Email Features

### Implemented
- ✅ Birthday reminders (scheduled function)

### Planned Future Features
- 📧 Welcome email for new employees
- 📧 Password reset emails
- 📧 Clock-in/out confirmations
- 📧 Attendance report emails
- 📧 Payroll notifications

---

## 🔄 Local Development

To test Firebase Functions locally:

```bash
# Start emulator
cd functions
firebase emulators:start --only functions

# Deploy to emulator
firebase deploy --only functions
```

**Note**: Email configuration must still be set in Firebase Functions config, even for local testing.

---

## 📝 Adding New Email Features

If you want to add more email functionality (like sending welcome emails to new employees), you can follow this pattern:

### Example: Send Welcome Email to New Employee

Add to `functions/index.js`:

```javascript
exports.sendWelcomeEmail = functions.https.onCall(async (data, context) => {
  const { email, displayName, tempPassword } = data;
  
  const mailOptions = {
    from: emailConfig.auth.user,
    to: email,
    subject: 'Welcome to Employee Portal',
    html: `
      <h2>Welcome ${displayName}!</h2>
      <p>Your account has been created.</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      <p>Please login and change your password immediately.</p>
    `,
  };
  
  await transporter.sendMail(mailOptions);
  return { success: true };
});
```

Then call it from your Next.js app when creating a user.

---

## 💡 Recommendations

### For Testing/Development
- Use **Gmail** with app password (free, easy to set up)

### For Production
- Use **SendGrid** or **AWS SES** (better deliverability, analytics, scalability)
- Set up proper domain authentication (SPF, DKIM, DMARC)
- Monitor email bounce rates and spam reports

---

## 📞 Support

If you encounter issues:
1. Check Firebase Functions logs: `firebase functions:log`
2. Verify configuration: `firebase functions:config:get`
3. Test SMTP credentials with the test script above
4. Check provider documentation for specific setup instructions

---

## Summary

Your email service is ready to use! Just:
1. Choose a provider (Gmail for quick start)
2. Get API credentials
3. Configure Firebase Functions
4. Deploy and test

The system will automatically send birthday reminders daily at 9 AM once configured.
