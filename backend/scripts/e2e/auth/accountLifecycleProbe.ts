import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const command = process.argv[2];

assertSafeEnvironment();

try {
  if (command === "security-email") {
    console.log(JSON.stringify(await inspectSecurityEmail()));
  } else if (command === "seed-review") {
    console.log(JSON.stringify(await seedDeliveredReview()));
  } else if (command === "inspect-deletion") {
    console.log(JSON.stringify(await inspectDeletion()));
  } else if (command === "cleanup-user") {
    console.log(JSON.stringify(await cleanupUser()));
  } else if (command === "cleanup-order") {
    console.log(JSON.stringify(await cleanupOrder()));
  } else {
    throw new Error(
      "Usage: accountLifecycleProbe.ts <security-email|seed-review|inspect-deletion|cleanup-user|cleanup-order> ...",
    );
  }
} finally {
  await prisma.$disconnect();
}

function assertSafeEnvironment() {
  if (process.env.E2E_FIXTURE_MODE !== "1") {
    throw new Error("E2E_FIXTURE_MODE=1 is required");
  }
  if (
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("Account lifecycle probes are forbidden in production");
  }
}

function requiredArgument(index: number, label: string) {
  const value = process.argv[index]?.trim();
  if (!value) throw new Error(`${label} is required`);
  return value;
}

async function inspectSecurityEmail() {
  const recipientEmail = requiredArgument(3, "recipient email").toLowerCase();
  const since = new Date(requiredArgument(4, "since timestamp"));
  if (Number.isNaN(since.getTime())) throw new Error("since timestamp is invalid");

  const messages = await prisma.emailOutbox.findMany({
    where: {
      recipientEmail,
      createdAt: { gte: since },
      OR: [
        { subject: { contains: "email", mode: "insensitive" } },
        { subject: { contains: "security", mode: "insensitive" } },
        { html: { contains: "email", mode: "insensitive" } },
        { subject: { contains: "password", mode: "insensitive" } },
        { html: { contains: "password", mode: "insensitive" } },
        { html: { contains: "security", mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      recipientEmail: true,
      subject: true,
      createdAt: true,
    },
  });

  return { count: messages.length, messages };
}

async function seedDeliveredReview() {
  const userId = requiredArgument(3, "user id");
  const productId = requiredArgument(4, "product id");
  const orderId = requiredArgument(5, "order id");

  const result = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "DELIVERED" },
    });
    const review = await tx.review.upsert({
      where: { productId_userId: { productId, userId } },
      update: {
        rating: 5,
        title: "Account lifecycle fixture",
        comment: "Disposable review used by the account-deletion launch gate.",
        verifiedPurchase: true,
        status: "APPROVED",
        purchaseOrderId: orderId,
      },
      create: {
        productId,
        userId,
        rating: 5,
        title: "Account lifecycle fixture",
        comment: "Disposable review used by the account-deletion launch gate.",
        verifiedPurchase: true,
        status: "APPROVED",
        purchaseOrderId: orderId,
      },
    });
    await tx.product.update({
      where: { id: productId },
      data: { ratingAvg: 5, ratingCount: 1 },
    });
    return review;
  });

  return { reviewId: result.id };
}

async function inspectDeletion() {
  const userId = requiredArgument(3, "user id");
  const firebaseUid = requiredArgument(4, "firebase uid");
  const originalEmail = requiredArgument(5, "original email").toLowerCase();
  const orderId = requiredArgument(6, "order id");
  const productId = requiredArgument(7, "product id");

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6381", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    const [
      userCount,
      reviewCount,
      wishlistCount,
      addressCount,
      stockAlertCount,
      subscriptionCount,
      serviceAreaPiiCount,
      securityEmailPiiCount,
      order,
      product,
      cartKeyCount,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          OR: [{ id: userId }, { firebaseUid }, { email: originalEmail }],
        },
      }),
      prisma.review.count({ where: { userId } }),
      prisma.wishlistItem.count({ where: { userId } }),
      prisma.address.count({ where: { userId } }),
      prisma.stockAlert.count({ where: { userId } }),
      prisma.userSubscription.count({ where: { userId } }),
      prisma.serviceAreaRequest.count({
        where: {
          OR: [{ userId }, { email: originalEmail }],
        },
      }),
      prisma.emailOutbox.count({ where: { recipientEmail: originalEmail } }),
      prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          contactEmail: true,
          addressSnapshot: true,
          status: true,
        },
      }),
      prisma.product.findUnique({
        where: { id: productId },
        select: { ratingAvg: true, ratingCount: true },
      }),
      redis.exists(
        `cart:user:${userId}`,
        `cart:user:${userId}:bundles`,
        `cart:user:${userId}:revision`,
        `auth:user:${firebaseUid}`,
      ),
    ]);

    return {
      userCount,
      reviewCount,
      wishlistCount,
      addressCount,
      stockAlertCount,
      subscriptionCount,
      serviceAreaPiiCount,
      securityEmailPiiCount,
      cartKeyCount,
      order,
      product,
    };
  } finally {
    await redis.quit();
  }
}

async function cleanupUser() {
  const email = requiredArgument(3, "user email").toLowerCase();
  if (!email.endsWith("@example.test")) {
    throw new Error("cleanup-user only accepts disposable @example.test users");
  }

  const users = await prisma.user.findMany({
    where: { email },
    select: { id: true, firebaseUid: true },
  });
  await prisma.emailOutbox.deleteMany({ where: { recipientEmail: email } });
  await prisma.serviceAreaRequest.deleteMany({ where: { email } });
  await prisma.user.deleteMany({ where: { email } });

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6381", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    const pipeline = redis.multi();
    for (const user of users) {
      pipeline.del(
        `cart:user:${user.id}`,
        `cart:user:${user.id}:bundles`,
        `cart:user:${user.id}:revision`,
        `auth:user:${user.firebaseUid}`,
        `auth:revoked:${user.firebaseUid}`,
      );
    }
    await pipeline.exec();
  } finally {
    await redis.quit();
  }

  return { ok: true, removedUsers: users.length };
}

async function cleanupOrder() {
  const orderId = requiredArgument(3, "order id");
  await prisma.$transaction([
    prisma.webhookEvent.deleteMany({ where: { localOrderId: orderId } }),
    prisma.emailOutbox.deleteMany({
      where: { referenceType: "Order", referenceId: orderId },
    }),
    prisma.checkoutAttempt.deleteMany({ where: { orderId } }),
    prisma.order.deleteMany({ where: { id: orderId } }),
  ]);
  return { ok: true, orderId };
}
