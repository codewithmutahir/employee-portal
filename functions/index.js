const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Email configuration - set these in Firebase config
const emailConfig = {
  host: functions.config().email?.host || 'smtp.gmail.com',
  port: functions.config().email?.port || 587,
  secure: false,
  auth: {
    user: functions.config().email?.user,
    pass: functions.config().email?.pass,
  },
};

// Recipient email for birthday reminders
const reminderEmail = functions.config().reminders?.email || 'hr@company.com';

const transporter = nodemailer.createTransport(emailConfig);

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
        console.log('No upcoming birthdays in the next 7 days');
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

      // Send email
      const mailOptions = {
        from: emailConfig.auth.user,
        to: reminderEmail,
        subject: 'Upcoming Employee Birthdays',
        text: `The following employees have birthdays in the next 7 days:\n\n${birthdayList}`,
        html: `
          <h2>Upcoming Employee Birthdays</h2>
          <p>The following employees have birthdays in the next 7 days:</p>
          <ul>
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
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Birthday reminder sent for ${upcomingBirthdays.length} employees`);

      return null;
    } catch (error) {
      console.error('Error checking birthdays:', error);
      throw error;
    }
  });

