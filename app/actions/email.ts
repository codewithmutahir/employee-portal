'use server';

// Mailtrap Email Service for Employee Portal
// This service handles all email sending functionality

const MAILTRAP_API_TOKEN = process.env.MAILTRAP_API_TOKEN;
const MAILTRAP_SENDER_EMAIL = process.env.MAILTRAP_SENDER_EMAIL || 'noreply@employeeportal.com';
const MAILTRAP_SENDER_NAME = process.env.MAILTRAP_SENDER_NAME || 'Employee Portal';

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  category?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email using Mailtrap API
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!MAILTRAP_API_TOKEN) {
    console.error('MAILTRAP_API_TOKEN is not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const recipients = Array.isArray(options.to) 
      ? options.to.map(email => ({ email }))
      : [{ email: options.to }];

    const response = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAILTRAP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: {
          email: MAILTRAP_SENDER_EMAIL,
          name: MAILTRAP_SENDER_NAME,
        },
        to: recipients,
        subject: options.subject,
        text: options.text,
        html: options.html,
        category: options.category || 'general',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Mailtrap API error:', errorData);
      return { 
        success: false, 
        error: errorData.message || `HTTP ${response.status}` 
      };
    }

    const data = await response.json();
    console.log('Email sent successfully:', data);
    
    return { 
      success: true, 
      messageId: data.message_ids?.[0] || data.id 
    };
  } catch (error: any) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send birthday reminder email to HR
 */
export async function sendBirthdayReminderEmail(
  hrEmail: string,
  birthdays: { name: string; email: string; date: string }[]
): Promise<EmailResult> {
  const birthdayList = birthdays
    .map(emp => `<li><strong>${emp.name}</strong> (${emp.email}) - ${emp.date}</li>`)
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🎂 Upcoming Birthdays</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">The following employees have birthdays in the next 7 days:</p>
        <ul style="color: #374151; line-height: 1.8;">
          ${birthdayList}
        </ul>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Don't forget to wish them a happy birthday! 🎉
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Upcoming Birthdays\n\nThe following employees have birthdays in the next 7 days:\n\n${birthdays.map(emp => `- ${emp.name} (${emp.email}) - ${emp.date}`).join('\n')}\n\nDon't forget to wish them a happy birthday!`;

  return sendEmail({
    to: hrEmail,
    subject: '🎂 Upcoming Employee Birthdays',
    html,
    text,
    category: 'birthday-reminder',
  });
}

/**
 * Send work anniversary reminder email to HR
 */
export async function sendAnniversaryReminderEmail(
  hrEmail: string,
  anniversaries: { name: string; email: string; years: number; date: string }[]
): Promise<EmailResult> {
  const getMilestoneEmoji = (years: number) => {
    if (years >= 25) return '💎';
    if (years >= 20) return '🏆';
    if (years >= 10) return '🥇';
    if (years >= 5) return '⭐';
    return '🎉';
  };

  const anniversaryList = anniversaries
    .map(emp => `
      <li style="margin-bottom: 8px;">
        <strong>${emp.name}</strong> (${emp.email})<br>
        <span style="color: #059669;">${getMilestoneEmoji(emp.years)} Completing ${emp.years} year${emp.years > 1 ? 's' : ''} on ${emp.date}</span>
      </li>
    `)
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🏆 Work Anniversaries</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">The following employees have work anniversaries coming up:</p>
        <ul style="color: #374151; line-height: 1.6; list-style: none; padding-left: 0;">
          ${anniversaryList}
        </ul>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Consider recognizing their dedication and contributions! 🎊
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Work Anniversaries\n\nThe following employees have work anniversaries coming up:\n\n${anniversaries.map(emp => `- ${emp.name} (${emp.email}) - Completing ${emp.years} year(s) on ${emp.date}`).join('\n')}\n\nConsider recognizing their dedication and contributions!`;

  return sendEmail({
    to: hrEmail,
    subject: '🏆 Upcoming Work Anniversaries',
    html,
    text,
    category: 'anniversary-reminder',
  });
}

/**
 * Send welcome email to new employee
 */
export async function sendWelcomeEmail(
  employeeEmail: string,
  employeeName: string,
  temporaryPassword?: string
): Promise<EmailResult> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">👋 Welcome to the Team!</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">Hi <strong>${employeeName}</strong>,</p>
        <p style="color: #374151; font-size: 16px;">
          Welcome to the company! Your Employee Portal account has been created.
        </p>
        ${temporaryPassword ? `
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="color: #92400e; margin: 0 0 8px 0; font-weight: bold;">Your Temporary Password:</p>
            <code style="background: #fff; padding: 8px 16px; border-radius: 4px; font-size: 18px; letter-spacing: 1px;">${temporaryPassword}</code>
            <p style="color: #92400e; margin: 8px 0 0 0; font-size: 14px;">
              Please change this password after your first login.
            </p>
          </div>
        ` : ''}
        <p style="color: #374151; font-size: 16px;">
          You can now access the Employee Portal to:
        </p>
        <ul style="color: #374151;">
          <li>Clock in and out</li>
          <li>View your attendance history</li>
          <li>Update your profile</li>
          <li>And more!</li>
        </ul>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          If you have any questions, please contact HR.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Welcome to the Team!\n\nHi ${employeeName},\n\nWelcome to the company! Your Employee Portal account has been created.\n\n${temporaryPassword ? `Your temporary password is: ${temporaryPassword}\nPlease change this password after your first login.\n\n` : ''}You can now access the Employee Portal to clock in/out, view attendance, and more.\n\nIf you have any questions, please contact HR.`;

  return sendEmail({
    to: employeeEmail,
    subject: '👋 Welcome to the Team - Your Portal Account',
    html,
    text,
    category: 'welcome',
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetLink: string
): Promise<EmailResult> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Password Reset</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">
          We received a request to reset your password for the Employee Portal.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetLink}" style="background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          This link will expire in 1 hour.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Password Reset\n\nWe received a request to reset your password for the Employee Portal.\n\nClick here to reset: ${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\n\nThis link will expire in 1 hour.`;

  return sendEmail({
    to: email,
    subject: '🔐 Password Reset Request',
    html,
    text,
    category: 'password-reset',
  });
}

/**
 * Send general notification email
 */
export async function sendNotificationEmail(
  to: string | string[],
  subject: string,
  message: string,
  category: string = 'notification'
): Promise<EmailResult> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">📢 Notification</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <div style="color: #374151; font-size: 16px; line-height: 1.6;">
          ${message.replace(/\n/g, '<br>')}
        </div>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html,
    text: message,
    category,
  });
}
