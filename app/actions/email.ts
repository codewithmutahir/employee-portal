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

/**
 * Send employee termination notification
 */
export async function sendTerminationEmail(
  employeeEmail: string,
  employeeName: string,
  terminationDate: string
): Promise<EmailResult> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Account Status Update</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">Dear ${employeeName},</p>
        <p style="color: #374151; font-size: 16px;">
          This email is to inform you that your Employee Portal account status has been changed to <strong>terminated</strong> as of ${terminationDate}.
        </p>
        <p style="color: #374151; font-size: 16px;">
          You will no longer be able to access the Employee Portal system.
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          If you believe this is an error, please contact Human Resources immediately.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Dear ${employeeName},\n\nThis email is to inform you that your Employee Portal account status has been changed to terminated as of ${terminationDate}.\n\nYou will no longer be able to access the Employee Portal system.\n\nIf you believe this is an error, please contact Human Resources immediately.`;

  return sendEmail({
    to: employeeEmail,
    subject: 'Account Status Update - Employee Portal',
    html,
    text,
    category: 'termination',
  });
}

/**
 * Send employee reactivation notification
 */
export async function sendReactivationEmail(
  employeeEmail: string,
  employeeName: string
): Promise<EmailResult> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Account Reactivated!</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">Dear ${employeeName},</p>
        <p style="color: #374151; font-size: 16px;">
          Great news! Your Employee Portal account has been <strong style="color: #059669;">reactivated</strong>.
        </p>
        <p style="color: #374151; font-size: 16px;">
          You can now log in and access all portal features:
        </p>
        <ul style="color: #374151;">
          <li>Clock in and out</li>
          <li>View your attendance history</li>
          <li>Check your profile and compensation</li>
        </ul>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Welcome back! If you have any questions, please contact HR.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Dear ${employeeName},\n\nGreat news! Your Employee Portal account has been reactivated.\n\nYou can now log in and access all portal features including clocking in/out, viewing attendance history, and more.\n\nWelcome back! If you have any questions, please contact HR.`;

  return sendEmail({
    to: employeeEmail,
    subject: '🎉 Account Reactivated - Employee Portal',
    html,
    text,
    category: 'reactivation',
  });
}

/**
 * Send compensation update notification
 */
export async function sendCompensationUpdateEmail(
  employeeEmail: string,
  employeeName: string,
  changes: {
    salary?: { old: number; new: number };
    allowance?: { old: number; new: number };
    bonus?: { old: number; new: number };
    currency: string;
  }
): Promise<EmailResult> {
  const changesList: string[] = [];
  const changesHtml: string[] = [];

  if (changes.salary) {
    changesList.push(`Salary: ${changes.currency} ${changes.salary.old.toLocaleString()} → ${changes.currency} ${changes.salary.new.toLocaleString()}`);
    changesHtml.push(`
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Salary</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-decoration: line-through; color: #9ca3af;">${changes.currency} ${changes.salary.old.toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #059669; font-weight: bold;">${changes.currency} ${changes.salary.new.toLocaleString()}</td>
      </tr>
    `);
  }

  if (changes.allowance) {
    changesList.push(`Allowance: ${changes.currency} ${changes.allowance.old.toLocaleString()} → ${changes.currency} ${changes.allowance.new.toLocaleString()}`);
    changesHtml.push(`
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Allowance</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-decoration: line-through; color: #9ca3af;">${changes.currency} ${changes.allowance.old.toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #059669; font-weight: bold;">${changes.currency} ${changes.allowance.new.toLocaleString()}</td>
      </tr>
    `);
  }

  if (changes.bonus) {
    changesList.push(`Bonus: ${changes.currency} ${changes.bonus.old.toLocaleString()} → ${changes.currency} ${changes.bonus.new.toLocaleString()}`);
    changesHtml.push(`
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Bonus</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-decoration: line-through; color: #9ca3af;">${changes.currency} ${changes.bonus.old.toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #059669; font-weight: bold;">${changes.currency} ${changes.bonus.new.toLocaleString()}</td>
      </tr>
    `);
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">💰 Compensation Update</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">Dear ${employeeName},</p>
        <p style="color: #374151; font-size: 16px;">
          Your compensation has been updated. Here are the details:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Type</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Previous</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">New</th>
            </tr>
          </thead>
          <tbody>
            ${changesHtml.join('')}
          </tbody>
        </table>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          If you have any questions about these changes, please contact HR.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Dear ${employeeName},\n\nYour compensation has been updated:\n\n${changesList.join('\n')}\n\nIf you have any questions about these changes, please contact HR.`;

  return sendEmail({
    to: employeeEmail,
    subject: '💰 Compensation Update - Employee Portal',
    html,
    text,
    category: 'compensation-update',
  });
}

/**
 * Send profile update notification
 */
export async function sendProfileUpdateEmail(
  employeeEmail: string,
  employeeName: string,
  updatedFields: string[]
): Promise<EmailResult> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">📝 Profile Updated</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">Dear ${employeeName},</p>
        <p style="color: #374151; font-size: 16px;">
          Your profile information has been updated by management. The following fields were changed:
        </p>
        <ul style="color: #374151;">
          ${updatedFields.map(field => `<li>${field}</li>`).join('')}
        </ul>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Please log in to the Employee Portal to review the changes. If you didn't expect these changes, please contact HR.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Dear ${employeeName},\n\nYour profile information has been updated by management.\n\nUpdated fields:\n${updatedFields.map(f => `- ${f}`).join('\n')}\n\nPlease log in to the Employee Portal to review the changes.`;

  return sendEmail({
    to: employeeEmail,
    subject: '📝 Profile Updated - Employee Portal',
    html,
    text,
    category: 'profile-update',
  });
}

/**
 * Send announcement email to multiple recipients
 */
export async function sendAnnouncementEmail(
  recipients: string[],
  title: string,
  content: string,
  priority: 'low' | 'normal' | 'high' | 'urgent',
  createdByName: string
): Promise<EmailResult> {
  const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
    low: { bg: '#6b7280', text: '#374151', label: 'Low Priority' },
    normal: { bg: '#3b82f6', text: '#1d4ed8', label: '' },
    high: { bg: '#f59e0b', text: '#d97706', label: '⚠️ High Priority' },
    urgent: { bg: '#ef4444', text: '#dc2626', label: '🚨 URGENT' },
  };

  const colors = priorityColors[priority] || priorityColors.normal;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, ${colors.bg} 0%, ${colors.text} 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">
          📢 ${colors.label ? colors.label + ' - ' : ''}Company Announcement
        </h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        ${priority === 'urgent' ? '<div style="background: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 12px; margin-bottom: 16px;"><p style="color: #dc2626; margin: 0; font-weight: bold;">⚠️ This is an urgent announcement. Please read immediately.</p></div>' : ''}
        <h2 style="color: #111827; font-size: 20px; margin: 0 0 16px 0;">${title}</h2>
        <div style="color: #374151; font-size: 16px; line-height: 1.6;">
          ${content.replace(/\n/g, '<br>')}
        </div>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px; margin: 0;">
            Posted by: <strong>${createdByName}</strong>
          </p>
          <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">
            ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 20px;">
          Log in to the Employee Portal to view this announcement and mark it as read.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `${colors.label ? colors.label + '\n\n' : ''}COMPANY ANNOUNCEMENT\n\n${title}\n\n${content}\n\nPosted by: ${createdByName}\n\nLog in to the Employee Portal to view this announcement.`;

  return sendEmail({
    to: recipients,
    subject: `📢 ${colors.label ? colors.label + ' - ' : ''}${title}`,
    html,
    text,
    category: 'announcement',
  });
}

/**
 * Send password change confirmation email
 */
export async function sendPasswordChangeEmail(
  employeeEmail: string,
  employeeName: string
): Promise<EmailResult> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🔒 Password Changed Successfully</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">Dear ${employeeName},</p>
        <p style="color: #374151; font-size: 16px;">
          Your Employee Portal password has been successfully changed.
        </p>
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="color: #92400e; margin: 0; font-weight: bold;">⚠️ Security Notice</p>
          <p style="color: #92400e; margin: 8px 0 0 0; font-size: 14px;">
            If you did not make this change, please contact HR immediately and secure your account.
          </p>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Changed on: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Dear ${employeeName},\n\nYour Employee Portal password has been successfully changed.\n\nIf you did not make this change, please contact HR immediately.\n\nChanged on: ${new Date().toLocaleString()}`;

  return sendEmail({
    to: employeeEmail,
    subject: '🔒 Password Changed - Employee Portal',
    html,
    text,
    category: 'security',
  });
}

/**
 * Send emergency contact update notification
 */
export async function sendEmergencyContactUpdateEmail(
  employeeEmail: string,
  employeeName: string,
  action: 'added' | 'updated' | 'removed',
  contactName: string
): Promise<EmailResult> {
  const actionText = {
    added: 'added to',
    updated: 'updated in',
    removed: 'removed from',
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">👥 Emergency Contact Updated</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 16px;">Dear ${employeeName},</p>
        <p style="color: #374151; font-size: 16px;">
          An emergency contact has been ${actionText[action]} your profile:
        </p>
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="color: #111827; margin: 0; font-weight: bold;">${contactName}</p>
          <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 14px;">
            Status: ${action.charAt(0).toUpperCase() + action.slice(1)}
          </p>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Log in to the Employee Portal to review your emergency contacts.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        Sent from Employee Portal
      </p>
    </div>
  `;

  const text = `Dear ${employeeName},\n\nAn emergency contact (${contactName}) has been ${actionText[action]} your profile.\n\nLog in to the Employee Portal to review your emergency contacts.`;

  return sendEmail({
    to: employeeEmail,
    subject: '👥 Emergency Contact Updated - Employee Portal',
    html,
    text,
    category: 'profile-update',
  });
}
