# Firebase User Setup Guide

This guide explains how to add employee and management users to the Firebase database.

## Collection: `employees`

All users (both employees and management) are stored in the `employees` collection.

---

## 📋 Required Fields (All Users)

These fields are **required** for both employee and management users:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `email` | string | User's email address (unique) | `"john.doe@company.com"` |
| `displayName` | string | Full name of the user | `"John Doe"` |
| `role` | string | User role: `"employee"` or `"management"` | `"employee"` |
| `status` | string | Account status: `"active"` or `"terminated"` | `"active"` |
| `hireDate` | timestamp | Date when user was hired | `2024-01-15T00:00:00Z` |
| `createdAt` | timestamp | Account creation timestamp | `Timestamp.now()` |
| `updatedAt` | timestamp | Last update timestamp | `Timestamp.now()` |

---

## ✨ Optional Fields (All Users)

These fields are **optional** but recommended:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `department` | string | Department name | `"Engineering"` |
| `departmentId` | string | Reference to Department document | `"dept_001"` |
| `position` | string | Job title/position | `"Software Engineer"` |
| `phoneNumber` | string | Contact phone number | `"+1234567890"` |
| `dateOfBirth` | timestamp | Date of birth (for birthday reminders) | `1990-05-20T00:00:00Z` |

---

## 👤 Example: Adding an Employee User

```javascript
// Firebase Console -> Firestore Database -> employees collection -> Add Document

{
  // Required Fields
  "email": "jane.smith@company.com",
  "displayName": "Jane Smith",
  "role": "employee",
  "status": "active",
  "hireDate": Timestamp(2024-01-15 00:00:00),
  "createdAt": Timestamp.now(),
  "updatedAt": Timestamp.now(),
  
  // Optional Fields
  "department": "Marketing",
  "departmentId": "dept_marketing",
  "position": "Marketing Specialist",
  "phoneNumber": "+1234567890",
  "dateOfBirth": Timestamp(1992-08-15 00:00:00)
}
```

**Document ID**: Use Firebase Auth UID or auto-generate

---

## 👨‍💼 Example: Adding a Management User

```javascript
// Firebase Console -> Firestore Database -> employees collection -> Add Document

{
  // Required Fields
  "email": "michael.manager@company.com",
  "displayName": "Michael Manager",
  "role": "management",          // ← Key difference: set to "management"
  "status": "active",
  "hireDate": Timestamp(2023-06-01 00:00:00),
  "createdAt": Timestamp.now(),
  "updatedAt": Timestamp.now(),
  
  // Optional Fields
  "department": "Operations",
  "departmentId": "dept_operations",
  "position": "Operations Manager",
  "phoneNumber": "+1234567891",
  "dateOfBirth": Timestamp(1985-03-10 00:00:00)
}
```

**Document ID**: Use Firebase Auth UID or auto-generate

---

## 🔑 Key Differences Between Employee & Management

| Aspect | Employee | Management |
|--------|----------|------------|
| **role** field | `"employee"` | `"management"` |
| **Permissions** | - View own attendance<br>- Clock in/out<br>- View own notes<br>- Limited access | - View all employees<br>- Edit all attendance<br>- Add/edit notes<br>- Export reports<br>- Full system access |
| **Dashboard** | Employee dashboard only | Management dashboard with admin features |

---

## 📝 Step-by-Step: Adding Users in Firebase Console

### Method 1: Manual Entry (Firebase Console)

1. **Go to Firebase Console** → Your Project → **Firestore Database**

2. **Navigate to `employees` collection**
   - If it doesn't exist, create it by clicking "Start collection"
   - Collection ID: `employees`

3. **Click "Add Document"**

4. **Set Document ID** (choose one):
   - **Auto-ID**: Click "Auto-ID" button (recommended for testing)
   - **Custom ID**: Use Firebase Auth UID (recommended for production)

5. **Add Fields** (click "Add field" for each):

   ```
   Field: email          Type: string      Value: user@company.com
   Field: displayName    Type: string      Value: User Name
   Field: role           Type: string      Value: employee (or management)
   Field: status         Type: string      Value: active
   Field: hireDate       Type: timestamp   Value: (select date)
   Field: createdAt      Type: timestamp   Value: (click "Set to current time")
   Field: updatedAt      Type: timestamp   Value: (click "Set to current time")
   
   // Optional fields
   Field: department     Type: string      Value: Engineering
   Field: position       Type: string      Value: Software Engineer
   Field: phoneNumber    Type: string      Value: +1234567890
   Field: dateOfBirth    Type: timestamp   Value: (select date)
   ```

6. **Click "Save"**

---

## 🔐 Authentication Setup

For users to log in, you also need to create Firebase Authentication entries:

1. **Go to Firebase Console** → **Authentication** → **Users**

2. **Click "Add user"**

3. **Enter:**
   - Email: Same as in Firestore `employees` collection
   - Password: Set temporary password (user should change on first login)

4. **Copy the UID** and update Firestore document:
   - Use this UID as the Document ID in `employees` collection
   - Or add a `uid` field to the employee document

---

## 🧪 Testing User Access

### Test Employee User
1. Log in with employee credentials
2. You should see:
   - ✅ Own attendance records
   - ✅ Clock in/out buttons
   - ✅ Notes from management
   - ❌ Cannot access other employees' data
   - ❌ No admin/management features

### Test Management User
1. Log in with management credentials
2. You should see:
   - ✅ All employees list
   - ✅ All attendance records
   - ✅ Export functionality
   - ✅ Add/edit notes
   - ✅ Edit attendance
   - ✅ Full dashboard access

---

## 🎨 Additional Collections (Optional)

### Collection: `employee_faces`
Stores facial recognition data for clock in/out:

```javascript
{
  "employeeId": "employee_doc_id",
  "descriptor": [0.123, -0.456, ...],  // 128-element array
  "updatedAt": Timestamp.now()
}
```
**Document ID**: Same as employee document ID

### Collection: `compensation`
Stores salary/compensation data:

```javascript
{
  "employeeId": "employee_doc_id",
  "salary": 75000,
  "allowance": 5000,
  "bonus": 10000,
  "currency": "USD",
  "hourlyRate": 36.06,
  "updatedAt": Timestamp.now(),
  "updatedBy": "manager_user_id"
}
```
**Document ID**: Same as employee document ID

---

## ⚠️ Important Notes

1. **Email Uniqueness**: Each email must be unique across both Firestore and Firebase Auth

2. **Role Validation**: 
   - Only use `"employee"` or `"management"` for the `role` field
   - Case-sensitive!

3. **Status Values**:
   - `"active"` - User can log in and use the system
   - `"terminated"` - User account is disabled

4. **Timestamps**:
   - Use Firebase Timestamp type, not strings
   - In Firebase Console, select "timestamp" as field type

5. **Document IDs**:
   - **Production**: Use Firebase Auth UID as document ID
   - **Testing**: Auto-generated IDs are fine

6. **Security**:
   - Ensure Firestore security rules are properly configured
   - Management users should have elevated permissions
   - Employees should only access their own data

---

## 🚀 Quick Start Template

Copy this JSON for quick testing (paste in Firebase Console):

```json
{
  "email": "test.employee@company.com",
  "displayName": "Test Employee",
  "role": "employee",
  "status": "active",
  "department": "Engineering",
  "position": "Developer",
  "phoneNumber": "+1234567890"
}
```

Then manually add timestamp fields:
- `hireDate` (timestamp)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

---

## 📞 Need Help?

If you encounter issues:
1. Check Firestore security rules
2. Verify field names match exactly (case-sensitive)
3. Ensure timestamps are proper Firebase Timestamp type
4. Check Firebase Authentication is enabled
5. Verify email exists in both Firestore and Auth

---

**Last Updated**: January 31, 2026
