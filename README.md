# beFitBeStrong

[![CI](https://github.com/Tarun0009/befitbestrongWeb/actions/workflows/ci.yml/badge.svg)](https://github.com/Tarun0009/befitbestrongWeb/actions/workflows/ci.yml)

beFitBeStrong is a full-stack fitness commerce platform with a responsive
storefront, secure checkout, customer accounts, and an admin console.

## Features

- Product discovery, cart, checkout, orders, wishlist, and reviews
- Online payments, cash on delivery, and delivery-area validation
- Inventory, catalog, order, customer, and promotion management
- Authentication, role-based access, notifications, and reporting

## Stack

Next.js, React, TypeScript, Express, PostgreSQL, Prisma, Redis, Firebase,
Razorpay, Tailwind CSS, Jest, and Playwright.

## Local setup

Requirements: Node.js 20+, pnpm, and Docker Desktop.

```bash
docker compose up -d

cd backend
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

In another terminal:

```bash
cd frontend
cp .env.local.example .env.local
pnpm install
pnpm dev
```

Configure the required values in the local environment files before using
authentication, payments, or external services. Never commit secrets or private
credentials.
