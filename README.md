# 🚀 Hardware ERP System: Technical Foundation & Onboarding Guide

Welcome to the Hardware ERP System. Over the past few days, the core foundation of this application has been architected, secured, and deployed to our `dev` branch. 

This document contains everything you need to know about the system architecture, our security protocols, and exactly how to get this running on your local machine (Windows or Mac) so we can start building features immediately.

---

## 🛠 1. The Technology Stack
We are using a modern, type-safe, and highly scalable stack:
* **Framework:** Next.js 14 (App Router)
* **Language:** TypeScript (Strict mode enabled)
* **Styling:** Tailwind CSS + shadcn/ui
* **Database:** PostgreSQL 16 (Dockerized to prevent local conflicts)
* **ORM:** Prisma v6 (Stable)
* **Authentication:** NextAuth.js (Credentials Provider + bcryptjs)

---

## 🏗 2. Architecture & Design Decisions
To ensure this system can handle real financial data and to prevent it from clashing with our other university projects (like LamiGo), several strict architectural decisions have been made:

### A. Database Isolation (Crucial)
We are running our PostgreSQL database inside a Docker container. 
* **Port Mapping:** It is mapped as `5433:5432`. This means on your host machine, you will connect to port **`5433`**. 
* **Why?** If you have another PostgreSQL instance running (like LamiGo) on the default `5432` port, this guarantees the two databases will never conflict and crash your system.

### B. Financial Data Safety
Standard number types (`Float` or `Int`) cause rounding errors when calculating currency. In our `schema.prisma`, all money-related fields (`buyingPrice`, `sellingPrice`, `totalAmount`) are strictly typed as `Decimal`.

### C. Authentication & Role-Based Access Control (RBAC)
We have implemented a strict, enterprise-grade security perimeter using NextAuth and Next.js Middleware.
* **No Public Sign-Ups:** There is no "Register" page. This is an internal business tool. 
* **The Genesis Admin:** The master account (the Uncle) was injected directly into the database via a backend seed script.
* **Staff Management:** Only an `ADMIN` can log in, access the `/users` dashboard, and manually generate accounts for Cashiers and Managers.

**The Middleware Vault:**
Our `src/middleware.ts` actively monitors every click. 
* **Admins** have full access to the `/dashboard` and `/users`.
* **Cashiers/Managers** are physically blocked from the Admin dashboard. If they try to access it, the middleware instantly kicks them to the `/billing` (Point of Sale) page.

---

## 💻 3. Local Setup Guide (Windows & Mac)

Follow these exact steps to get the environment running on your machine. Do not skip any steps.

### Prerequisites (For all OS)
1. **Node.js:** Ensure you have Node.js version 20+ installed.
2. **Docker:** Ensure Docker Desktop is installed and actively running in the background.
3. **Git:** Ensure Git is installed.

### Step-by-Step Installation

**1. Clone the Repository & Enter the Dev Branch**
We do not work on `main`. We integrate on `dev`.
```bash
git clone -b dev https://github.com/chanul26/hardware-erp-system.git
cd hardware-erp-system
```

**2. Install Dependencies**
```bash
npm install
```

**3. Configure Environment Variables**
* Duplicate the `.env.example` file and rename the copy to `.env`.
* (You do not need to change any of the default values for local development. The Docker connection strings are already perfect).

**4. Boot the Isolated Database**
Start the PostgreSQL Docker container. (It will run quietly in the background on port 5433).
```bash
docker compose up -d
```

**5. Sync Database & Generate Types**
Push our Prisma schema to the new Docker database and generate the TypeScript client.
```bash
npx prisma db push
npx prisma generate
```

**6. Inject the Master Admin (The Seed Script)**
Run this script to securely hash and inject the default Admin account into your local database.
```bash
npm run prisma:seed
# Note: Ensure "prisma": {"seed": "tsx prisma/seed.ts"} is in package.json
# Alternatively, run: npx tsx prisma/seed.ts
```

**7. Start the Development Server**
To avoid port conflicts with other Next.js apps, we run this app on port **3001**.
```bash
npm run dev
```

### Verification
1. Open your browser to `http://localhost:3001`.
2. Click **Sign In**.
3. Log in with the Genesis credentials:
   * **Email:** `admin@hardware.com`
   * **Password:** `Admin@2026!`
4. You should be securely routed to the Admin Dashboard. Test creating a Cashier account in the "Staff Management" tab!

---

## 🌿 4. Team Workflow & CI/CD

To prevent us from overwriting each other's code, we are using a strict branching model protected by a GitHub Actions CI pipeline.

**The Golden Rules:**
1. **Never push to `main` or `dev` directly.**
2. When starting a new task, branch off `dev`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. When finished, push your branch and open a **Pull Request (PR)** targeting `dev`.

**The CI Pipeline (`.github/workflows/ci.yml`)**
When you open a PR, our GitHub Action will automatically boot up a cloud server and test your code. It will run:
* `npm run lint` (Checks for syntax/formatting errors)
* `npx tsc --noEmit` (Checks for strict TypeScript errors)
* A test build of the Next.js application.

**If your code fails the CI pipeline, you cannot merge it.** Always run `npm run lint` and `npx tsc --noEmit` locally before you push!

---

## 🎯 5. Next Steps / Current Objectives
The foundation is locked. We are now moving into Feature Development. The immediate next modules to tackle are:
1. **Inventory API:** Building the endpoints to create items, scan barcodes, and check stock levels.
2. **Point of Sale (POS) UI:** Building the `/billing` page for cashiers to scan items and generate bills.

Let's assign tasks and start building!

***

