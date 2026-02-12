const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Mailtrap configuration - set these in Firebase config
const MAILTRAP_API_TOKEN = functions.config().mailtrap?.api_token;
const MAILTRAP_SENDER_EMAIL = functions.config().mailtrap?.sender_email || 'noreply@employeeportal.com';
const MAILTRAP_SENDER_NAME = functions.config().mailtrap?.sender_name || 'Employee Portal';

// Recipient email for reminders
const reminderEmail = functions.config().reminders?.email || 'hr@company.com';

/**
 * Send email using Mailtrap API
 */
async function sendMailtrapEmail(to, subject, text, html, category = 'general') {
  if (!MAILTRAP_API_TOKEN) {
    console.error('MAILTRAP_API_TOKEN is not configured');
    throw new Error('Email service not configured');
  }

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
      to: [{ email: to }],
      subject,
      text,
      html,
      category,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Mailtrap API error:', errorData);
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Scheduled function to check for upcoming birthdays and send reminders
 * Runs daily at 9 AM
 */
exports.checkBirthdays = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    try {
      const today = new Date();
      const upcomingDate = new Date();
      upcomingDate.setDate(today.getDate() + 7); // Check next 7 days

      const employeesSnapshot = await admin.firestore()
        .collection('employees')
        .where('status', '==', 'active')
        .get();

      const upcomingBirthdays = [];

      employeesSnapshot.forEach((doc) => {
        const employee = doc.data();
        if (!employee.dateOfBirth) return;

        const birthDate = new Date(employee.dateOfBirth);
        const thisYear = new Date(
          today.getFullYear(),
          birthDate.getMonth(),
          birthDate.getDate()
        );
        const nextYear = new Date(
          today.getFullYear() + 1,
          birthDate.getMonth(),
          birthDate.getDate()
        );

        if (
          (thisYear >= today && thisYear <= upcomingDate) ||
          (nextYear >= today && nextYear <= upcomingDate)
        ) {
          upcomingBirthdays.push({
            name: employee.displayName,
            date: birthDate,
            email: employee.email,
          });
        }
      });

      if (upcomingBirthdays.length === 0) {
        return null;
      }

      // Format birthday list
      const birthdayList = upcomingBirthdays
        .map((emp) => {
          const date = new Date(emp.date);
          const thisYear = new Date(
            today.getFullYear(),
            date.getMonth(),
            date.getDate()
          );
          return `- ${emp.name} (${emp.email}) - ${thisYear.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
          })}`;
        })
        .join('\n');

      // Send email using Mailtrap
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎂 Upcoming Birthdays</h1>
          </div>
          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="color: #374151; font-size: 16px;">The following employees have birthdays in the next 7 days:</p>
            <ul style="color: #374151; line-height: 1.8;">
              ${upcomingBirthdays
                .map((emp) => {
                  const date = new Date(emp.date);
                  const thisYear = new Date(
                    today.getFullYear(),
                    date.getMonth(),
                    date.getDate()
                  );
                  return `<li><strong>${emp.name}</strong> (${emp.email}) - ${thisYear.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                  })}</li>`;
                })
                .join('')}
            </ul>
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Don't forget to wish them a happy birthday! 🎉
            </p>
          </div>
        </div>
      `;

      await sendMailtrapEmail(
        reminderEmail,
        '🎂 Upcoming Employee Birthdays',
        `The following employees have birthdays in the next 7 days:\n\n${birthdayList}`,
        htmlContent,
        'birthday-reminder'
      );

      return null;
    } catch (error) {
      console.error('Error checking birthdays:', error);
      throw error;
    }
  });

/**
 * Scheduled function to check for upcoming work anniversaries and send reminders
 * Runs daily at 9 AM
 */
exports.checkAnniversaries = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    try {
      const today = new Date();
      const upcomingDate = new Date();
      upcomingDate.setDate(today.getDate() + 14); // Check next 14 days

      const employeesSnapshot = await admin.firestore()
        .collection('employees')
        .where('status', '==', 'active')
        .get();

      const upcomingAnniversaries = [];
      const MILESTONE_YEARS = [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

      employeesSnapshot.forEach((doc) => {
        const employee = doc.data();
        if (!employee.hireDate) return;

        let hireDate;
        if (employee.hireDate._seconds) {
          hireDate = new Date(employee.hireDate._seconds * 1000);
        } else if (employee.hireDate.seconds) {
          hireDate = new Date(employee.hireDate.seconds * 1000);
        } else {
          hireDate = new Date(employee.hireDate);
        }

        if (isNaN(hireDate.getTime())) return;

        // Calculate this year's anniversary
        const thisYearAnniversary = new Date(
          today.getFullYear(),
          hireDate.getMonth(),
          hireDate.getDate()
        );

        let anniversaryDate = thisYearAnniversary;
        let yearsCompleting = today.getFullYear() - hireDate.getFullYear();

        if (thisYearAnniversary < today) {
          anniversaryDate = new Date(
            today.getFullYear() + 1,
            hireDate.getMonth(),
            hireDate.getDate()
          );
          yearsCompleting = today.getFullYear() + 1 - hireDate.getFullYear();
        }

        // Check if within our date range and is a milestone
        if (
          anniversaryDate >= today && 
          anniversaryDate <= upcomingDate &&
          MILESTONE_YEARS.includes(yearsCompleting)
        ) {
          upcomingAnniversaries.push({
            name: employee.displayName,
            email: employee.email,
            date: anniversaryDate,
            years: yearsCompleting,
          });
        }
      });

      if (upcomingAnniversaries.length === 0) {
        return null;
      }

      // Format anniversary list
      const getMilestoneEmoji = (years) => {
        if (years >= 25) return '💎';
        if (years >= 20) return '🏆';
        if (years >= 10) return '🥇';
        if (years >= 5) return '⭐';
        return '🎉';
      };

      const anniversaryList = upcomingAnniversaries
        .map((emp) => `- ${emp.name} (${emp.email}) - ${getMilestoneEmoji(emp.years)} Completing ${emp.years} years on ${emp.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`)
        .join('\n');

      // Send email using Mailtrap
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🏆 Upcoming Work Anniversaries</h1>
          </div>
          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="color: #374151; font-size: 16px;">The following employees have milestone work anniversaries coming up:</p>
            <ul style="color: #374151; line-height: 1.8; list-style: none; padding-left: 0;">
              ${upcomingAnniversaries
                .map((emp) => `
                  <li style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <strong>${emp.name}</strong> (${emp.email})<br>
                    <span style="color: #059669;">${getMilestoneEmoji(emp.years)} Completing ${emp.years} year${emp.years > 1 ? 's' : ''} on ${emp.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
                  </li>
                `)
                .join('')}
            </ul>
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Consider recognizing their dedication and contributions! 🎊
            </p>
          </div>
        </div>
      `;

      await sendMailtrapEmail(
        reminderEmail,
        '🏆 Upcoming Work Anniversaries',
        `Milestone work anniversaries in the next 14 days:\n\n${anniversaryList}`,
        htmlContent,
        'anniversary-reminder'
      );

      return null;
    } catch (error) {
      console.error('Error checking anniversaries:', error);
      throw error;
    }
  });

