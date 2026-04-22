# Blood Bank Management System

A full-stack blood bank management system built for a DBMS course, implementing donor management, blood requests, inventory tracking, approval workflows, and admin analytics.

## Project Structure

```
blood-bank/
├── backend/                 # Node.js + Express API
│   ├── config/
│   │   └── database.js     # PostgreSQL connection pool
│   ├── controllers/         # Business logic for each module
│   │   ├── authController.js
│   │   ├── donorController.js
│   │   ├── recipientController.js
│   │   ├── stockController.js
│   │   ├── approvalController.js
│   │   └── reportController.js
│   ├── middleware/
│   │   ├── auth.js         # JWT & RBAC middleware
│   │   └── validation.js   # Input validation
│   ├── routes/             # API endpoints
│   │   ├── auth.js
│   │   ├── donor.js
│   │   ├── recipient.js
│   │   ├── stock.js
│   │   ├── approval.js
│   │   └── reports.js
│   ├── server.js           # Express app entry point
│   ├── .env                # Environment configuration
│   └── package.json
│
├── frontend/               # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── DonorDashboard.jsx
│   │   │   ├── RecipientDashboard.jsx
│   │   │   └── AdminDashboard.jsx
│   │   ├── components/
│   │   │   └── ProtectedRoute.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx    # Global auth state
│   │   ├── api/
│   │   │   └── apiService.js      # Centralized API calls
│   │   ├── styles/
│   │   │   ├── Auth.css
│   │   │   └── Dashboard.css
│   │   ├── App.jsx                # Main router
│   │   └── main.jsx
│   └── package.json
│
└── db/
    └── schema.sql          # Database schema & constraints
```

## Technology Stack

- **Backend**: Node.js, Express.js, PostgreSQL
- **Frontend**: React 18+, Vite, React Router, Axios
- **Authentication**: JWT with role-based access control (RBAC)
- **Database**: PostgreSQL with constraints and indexes

## Features

### 1. Donor Management
- Donor registration with validation (age 18-65, blood group, email/phone uniqueness)
- Profile management
- Donation history tracking
- 56-day minimum interval enforcement between donations
- Donor search by blood group and city

### 2. Recipient & Blood Request Management
- Recipient registration with hospital and urgency level
- Blood request creation with units and urgency flags
- Request status tracking (Pending → Approved → Fulfilled)
- Request history and search functionality

### 3. Blood Stock Management
- Real-time inventory dashboard
- Stock addition with expiry dates
- Stock reduction tracking
- Expiry warnings (30-day notice)
- Low stock alerts (< 5 units)

### 4. Approval & Issue Workflow
- Admin approval/rejection of blood requests
- Blood issuing with stock deduction
- Audit trail for all transactions
- Workflow enforcement (approve before issue)

### 5. Admin Analytics & Reports
- System summary statistics (donors, recipients, requests, stock)
- Blood usage analytics by group
- Donor demographics
- Recipient request trends
- Filtered reports (date range, blood group, status)

### 6. Security & Validation
- JWT-based authentication
- Role-based access control (Admin, Donor, Recipient)
- Input validation on all endpoints
- Duplicate prevention
- Emergency priority handling

## Setup Instructions

### ⭐ RECOMMENDED: Docker Setup (Easiest - 3 minutes!)

**Prerequisites**: Just Docker installed ([Download here](https://www.docker.com/products/docker-desktop))

```bash
# From project root directory
docker-compose up --build

# In NEW terminal
cd frontend
npm run dev
```

That's it! Everything is running:
- ✅ PostgreSQL (auto-initialized)
- ✅ Backend API
- ✅ Database schema (auto-loaded)
- ✅ Sample data (auto-loaded)

**See `DOCKER_QUICK_START.md` for detailed Docker instructions**

---

### Alternative: Manual PostgreSQL Setup

If you prefer traditional setup without Docker:

**Prerequisites**:
- Node.js (v18+)
- PostgreSQL (v12+)
- npm or yarn

#### Backend Setup

## API Endpoints

### Authentication
- `POST /api/auth/register/donor` - Register as donor
- `POST /api/auth/register/recipient` - Register as recipient
- `POST /api/auth/login` - User login

### Donor Management
- `GET /api/donors/profile/:id` - Get donor profile
- `PUT /api/donors/profile/:id` - Update profile
- `GET /api/donors/search` - Search donors
- `POST /api/donors/:donor_id/donation` - Record donation
- `GET /api/donors/:id/history` - Get donation history

### Recipient Management
- `GET /api/recipients/profile/:id` - Get recipient profile
- `POST /api/recipients/request` - Create blood request
- `GET /api/recipients/request/:id` - Get request status
- `GET /api/recipients/request/search/all` - Search requests
- `GET /api/recipients/:recipient_id/request-history` - Get history

### Stock Management
- `GET /api/stock/` - Get all stock
- `GET /api/stock/:blood_group` - Get stock by blood group
- `POST /api/stock/add` - Add stock (admin only)
- `POST /api/stock/reduce` - Reduce stock (admin only)
- `GET /api/stock/warnings/expiry` - Get expiry warnings (admin only)
- `GET /api/stock/alerts/low-stock` - Get low stock alerts (admin only)

### Approval & Issue
- `POST /api/approvals/` - Create approval (admin only)
- `PUT /api/approvals/:id` - Update approval status (admin only)
- `GET /api/approvals/history/all` - Get approval history (admin only)
- `POST /api/approvals/issue` - Issue blood (admin only)
- `GET /api/approvals/issues/history` - Get issue history (admin only)

### Reports
- `GET /api/reports/summary` - Get system summary (admin only)
- `GET /api/reports/blood-usage` - Get blood usage stats (admin only)
- `GET /api/reports/donor-stats` - Get donor statistics (admin only)
- `GET /api/reports/recipient-stats` - Get recipient stats (admin only)
- `GET /api/reports/filtered` - Get filtered reports (admin only)
- `GET /api/reports/status-distribution` - Get request status distribution (admin only)
- `GET /api/reports/audit-logs` - Get tenant audit logs (admin only)

## Usage Workflows

### 1. Donor Registration & Donation
1. Register as donor (name, age, blood group, email, phone, city)
2. Login with credentials
3. View profile and donation history
4. Donate blood (recorded by admin with 56-day interval check)

### 2. Recipient Blood Request
1. Register as recipient (name, blood group needed, hospital, contact, urgency)
2. Login with credentials
3. Create blood request (specify units needed and urgency)
4. Track request status through dashboard
5. View request history

### 3. Admin Workflow
1. Login as admin
2. **Inventory Management**: Add/view blood stock with expiry dates
3. **Approvals**: Review pending blood requests and approve/reject
4. **Issue Blood**: Issue approved blood and update stock
5. **Reports**: View analytics and statistics

## Database Schema

### Tables
- **USER**: user_id, username, password, role
- **DONOR**: donor_id, name, age, blood_group, phone, email, city, last_donation_date
- **RECIPIENT**: recipient_id, name, blood_group_needed, hospital, contact, urgency_level
- **BLOOD_REQUEST**: request_id, recipient_id, units_requested, request_date, urgency_flag, status
- **BLOOD_STOCK**: stock_id, blood_group, units_available, expiry_date
- **APPROVAL**: approval_id, blood_request_id, status, approval_date, admin_id
- **BLOOD_ISSUE**: issue_id, blood_request_id, stock_id, units_issued, issue_date, admin_id

### Constraints
- Blood groups: A+, A-, B+, B-, O+, O-, AB+, AB-
- Donor age: 18-65 years
- Urgency levels: Low, Medium, High, Critical
- Request status: Pending, Approved, Rejected, Fulfilled, Cancelled
- Approval status: Pending, Approved, Rejected

## Testing

### Test User Credentials

You can use the following to test after setup:

**Test Data to Create via Registration:**

1. **Donor Account**
   - Username: donor1
   - Password: password123
   - Name: John Doe
   - Age: 30
   - Blood Group: O+
   - Email: donor1@email.com
   - Phone: 9876543210

2. **Recipient Account**
   - Username: recipient1
   - Password: password123
   - Name: Jane Smith
   - Blood Group Needed: O+
   - Hospital: City Hospital
   - Contact: 9876543211
   - Urgency: High

3. **Admin Account** (create via backend if needed)
   - Username: admin
   - Password: adminpass123
   - Role: admin

### Manual Testing Steps

1. **Donor Flow**:
   - Register → Login → View profile → Check donation history

2. **Recipient Flow**:
   - Register → Login → Create blood request → Track status → View history

3. **Admin Flow**:
   - Login → Add blood stock → View inventory → Approve requests → Issue blood → View reports

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL is running: `brew services start postgresql@14`
- Check credentials in `.env` file
- Verify database exists: `psql -l`

### Port Already in Use
- Backend: Change `PORT` in `.env`
- Frontend: Frontend Vite will automatically use next available port

### CORS Errors
- Check `CORS_ORIGIN` in backend `.env` matches frontend URL
- Ensure backend is running when frontend makes requests

### JWT Token Errors
- Clear browser localStorage and login again
- Check `JWT_SECRET` in `.env` matches on backend

## Course Submission

For course submission, include:
1. Complete backend with all API endpoints
2. Complete frontend with all dashboards
3. Database schema (schema.sql)
4. Environment configuration files
5. README (this file) with setup and usage instructions

## Assignment Members

This implementation covers all 6 module responsibilities:

1. **Donor Management** - Donor registration, profile, search, donation history
2. **Recipient/Blood Request** - Recipient registration, request creation, tracking
3. **Blood Stock Management** - Inventory dashboard, expiry warnings, low stock alerts
4. **Approval & Issue Workflow** - Request approval, blood issuing, audit trails
5. **Admin Panel & Reports** - Analytics, summaries, filtered reports
6. **Security & Validation** - Auth, RBAC, input validation, duplicate prevention

## License

For BITS DBMS Course - 2024-2025

---

**Last Updated**: April 2026
**Status**: Complete and Ready for Testing
## Security Hardening Notes

- Tenant-aware authorization context is enforced per request and propagated to PostgreSQL session settings (`app.current_tenant`, `app.current_user_id`, `app.current_role`).
- Tenant-owned tables use PostgreSQL Row Level Security policies for defense-in-depth.
- Critical mutations are captured in immutable `audit_log` entries.
- API rate limits are enabled globally and stricter on authentication endpoints.
