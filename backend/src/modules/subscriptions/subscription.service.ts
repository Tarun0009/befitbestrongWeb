import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  addFrequencyDays,
  calculateSubscriptionPrice,
} from "./subscriptionPolicy.js";
import { sendSubscriptionRenewalEmail } from "./subscriptionEmail.service.js";

const planInclude = {
  variant: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          active: true,
          currency: true,
          images: {
            orderBy: { position: "asc" as const },
            take: 1,
            select: { url: true, alt: true },
          },
        },
      },
    },
  },
} satisfies Prisma.SubscriptionPlanInclude;

const subscriptionInclude = {
  plan: { include: planInclude },
  renewals: { orderBy: { scheduledFor: "desc" as const }, take: 10 },
} satisfies Prisma.UserSubscriptionInclude;

type PlanWithVariant = Prisma.SubscriptionPlanGetPayload<{ include: typeof planInclude }>;

function presentPlan(plan: PlanWithVariant) {
  return {
    id: plan.id,
    name: plan.name,
    active: plan.active,
    discountPercent: plan.discountPercent,
    allowedFrequencies: plan.allowedFrequencies,
    variant: {
      id: plan.variant.id,
      sku: plan.variant.sku,
      size: plan.variant.size,
      color: plan.variant.color,
      price: plan.variant.price,
      stock: plan.variant.stock,
      discountedPrice: calculateSubscriptionPrice(
        plan.variant.price,
        plan.discountPercent,
      ),
      product: {
        id: plan.variant.product.id,
        name: plan.variant.product.name,
        slug: plan.variant.product.slug,
        active: plan.variant.product.active,
        currency: plan.variant.product.currency,
        image: plan.variant.product.images[0] ?? null,
      },
    },
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export async function listPublicSubscriptionPlans(variantId?: string) {
  const rows = await prisma.subscriptionPlan.findMany({
    where: {
      active: true,
      ...(variantId ? { variantId } : {}),
      variant: { product: { active: true } },
    },
    orderBy: { createdAt: "desc" },
    include: planInclude,
  });
  return { items: rows.map(presentPlan) };
}

export async function listAdminSubscriptionPlans() {
  const rows = await prisma.subscriptionPlan.findMany({
    orderBy: { createdAt: "desc" },
    include: planInclude,
  });
  return { items: rows.map(presentPlan) };
}

export async function createSubscriptionPlan(input: {
  name: string;
  variantId: string;
  discountPercent: number;
  allowedFrequencies: number[];
  active: boolean;
}) {
  const row = await prisma.subscriptionPlan.create({
    data: {
      ...input,
      allowedFrequencies: [...new Set(input.allowedFrequencies)].sort(
        (a, b) => a - b,
      ),
    },
    include: planInclude,
  });
  return { plan: presentPlan(row) };
}

export async function updateSubscriptionPlan(
  id: string,
  input: {
    name: string;
    discountPercent: number;
    allowedFrequencies: number[];
    active: boolean;
  },
) {
  const row = await prisma.subscriptionPlan.update({
    where: { id },
    data: {
      ...input,
      allowedFrequencies: [...new Set(input.allowedFrequencies)].sort(
        (a, b) => a - b,
      ),
    },
    include: planInclude,
  });
  return { plan: presentPlan(row) };
}

export async function deleteSubscriptionPlan(id: string) {
  const subscribers = await prisma.userSubscription.count({
    where: { planId: id },
  });
  if (subscribers > 0) {
    throw new HttpError(
      409,
      "subscription_plan_in_use",
      "Deactivate plans that already have subscribers instead of deleting them",
    );
  }
  await prisma.subscriptionPlan.delete({ where: { id } });
}

export async function enrollSubscription(
  userId: string,
  input: {
    planId: string;
    orderId: string;
    quantity: number;
    frequencyDays: number;
  },
) {
  const [plan, order, existing] = await Promise.all([
    prisma.subscriptionPlan.findUnique({
      where: { id: input.planId },
      include: planInclude,
    }),
    prisma.order.findFirst({
      where: {
        id: input.orderId,
        userId,
        status: { in: ["PAID", "SHIPPED", "DELIVERED"] },
        items: { some: { variantId: { not: "" } } },
      },
      include: { items: { select: { variantId: true, quantity: true } } },
    }),
    prisma.userSubscription.findFirst({
      where: {
        userId,
        planId: input.planId,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: { id: true },
    }),
  ]);

  if (!plan || !plan.active || !plan.variant.product.active) {
    throw new HttpError(404, "subscription_plan_not_found", "Plan not found");
  }
  if (!order || !order.items.some((item) => item.variantId === plan.variantId)) {
    throw new HttpError(
      403,
      "subscription_order_ineligible",
      "Subscribe from a paid order containing this exact variant",
    );
  }
  if (!plan.allowedFrequencies.includes(input.frequencyDays)) {
    throw new HttpError(
      400,
      "subscription_frequency_invalid",
      "This delivery frequency is not available for the plan",
    );
  }
  if (existing) {
    throw new HttpError(
      409,
      "subscription_exists",
      "You already have an active or paused subscription for this plan",
    );
  }

  const subscription = await prisma.userSubscription.create({
    data: {
      userId,
      planId: plan.id,
      planNameSnapshot: plan.name,
      discountPercent: plan.discountPercent,
      quantity: input.quantity,
      frequencyDays: input.frequencyDays,
      nextOrderAt: addFrequencyDays(new Date(), input.frequencyDays),
      contactEmail: order.contactEmail,
      shippingSnapshot: order.addressSnapshot as Prisma.InputJsonValue,
      createdFromOrderId: order.id,
    },
    include: subscriptionInclude,
  });
  return { subscription };
}

export async function listUserSubscriptions(userId: string) {
  const items = await prisma.userSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: subscriptionInclude,
  });
  return { items };
}

export async function controlSubscription(
  userId: string,
  id: string,
  action: "pause" | "resume" | "skip" | "cancel",
) {
  const current = await prisma.userSubscription.findFirst({
    where: { id, userId },
    include: { plan: { include: planInclude } },
  });
  if (!current) {
    throw new HttpError(404, "subscription_not_found", "Subscription not found");
  }
  if (current.status === "CANCELLED") {
    throw new HttpError(409, "subscription_cancelled", "Subscription is cancelled");
  }

  if (action === "pause") {
    if (current.status !== "ACTIVE") {
      throw new HttpError(409, "subscription_not_active", "Only active subscriptions can be paused");
    }
    return prisma.userSubscription.update({
      where: { id },
      data: { status: "PAUSED", pausedAt: new Date() },
      include: subscriptionInclude,
    });
  }
  if (action === "resume") {
    if (current.status !== "PAUSED") {
      throw new HttpError(409, "subscription_not_paused", "Only paused subscriptions can be resumed");
    }
    const nextOrderAt =
      current.nextOrderAt <= new Date()
        ? addFrequencyDays(new Date(), current.frequencyDays)
        : current.nextOrderAt;
    return prisma.userSubscription.update({
      where: { id },
      data: { status: "ACTIVE", pausedAt: null, nextOrderAt },
      include: subscriptionInclude,
    });
  }
  if (action === "cancel") {
    return prisma.userSubscription.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: subscriptionInclude,
    });
  }

  if (current.status !== "ACTIVE") {
    throw new HttpError(409, "subscription_not_active", "Only active subscriptions can be skipped");
  }
  const scheduledFor = current.nextOrderAt;
  const nextOrderAt = addFrequencyDays(scheduledFor, current.frequencyDays);
  return prisma.$transaction(async (tx) => {
    await tx.subscriptionRenewal.upsert({
      where: {
        subscriptionId_scheduledFor: { subscriptionId: id, scheduledFor },
      },
      update: { status: "SKIPPED" },
      create: {
        subscriptionId: id,
        scheduledFor,
        status: "SKIPPED",
        unitPriceSnapshot: current.plan.variant.price,
        discountedUnitPrice: calculateSubscriptionPrice(
          current.plan.variant.price,
          current.discountPercent,
        ),
        quantity: current.quantity,
      },
    });
    return tx.userSubscription.update({
      where: { id },
      data: { nextOrderAt },
      include: subscriptionInclude,
    });
  });
}

export async function processDueSubscriptions(now = new Date()) {
  const due = await prisma.userSubscription.findMany({
    where: { status: "ACTIVE", nextOrderAt: { lte: now } },
    include: { plan: { include: planInclude } },
    take: 100,
  });
  const results: Array<{ id: string; status: "READY" | "STOCK_BLOCKED" }> = [];

  for (const subscription of due) {
    const scheduledFor = subscription.nextOrderAt;
    const ready =
      subscription.plan.active &&
      subscription.plan.variant.product.active &&
      subscription.plan.variant.stock >= subscription.quantity;
    const status = ready ? "READY" as const : "STOCK_BLOCKED" as const;
    const discountedUnitPrice = calculateSubscriptionPrice(
      subscription.plan.variant.price,
      subscription.discountPercent,
    );

    const renewal = await prisma.$transaction(async (tx) => {
      const advance = await tx.userSubscription.updateMany({
        where: { id: subscription.id, nextOrderAt: scheduledFor, status: "ACTIVE" },
        data: {
          nextOrderAt: addFrequencyDays(scheduledFor, subscription.frequencyDays),
        },
      });
      if (advance.count === 0) return null;
      return tx.subscriptionRenewal.upsert({
        where: {
          subscriptionId_scheduledFor: {
            subscriptionId: subscription.id,
            scheduledFor,
          },
        },
        update: {},
        create: {
          subscriptionId: subscription.id,
          scheduledFor,
          status,
          unitPriceSnapshot: subscription.plan.variant.price,
          discountedUnitPrice,
          quantity: subscription.quantity,
        },
      });
    });

    if (!renewal) continue;
    results.push({ id: renewal.id, status });
    if (!renewal.notifiedAt) {
      void sendSubscriptionRenewalEmail({
        to: subscription.contactEmail,
        productName: subscription.plan.variant.product.name,
        quantity: subscription.quantity,
        ready,
        discountedTotal: discountedUnitPrice * subscription.quantity,
      })
        .then(async (sent) => {
          if (sent) {
            await prisma.subscriptionRenewal.update({
              where: { id: renewal.id },
              data: { notifiedAt: new Date() },
            });
          }
        })
        .catch(() => undefined);
    }
  }

  return { processed: results.length, results };
}

export async function getAdminSubscriptionSummary() {
  const [plans, statuses, upcoming, recentRenewals] = await Promise.all([
    listAdminSubscriptionPlans(),
    prisma.userSubscription.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.userSubscription.findMany({
      where: { status: "ACTIVE" },
      orderBy: { nextOrderAt: "asc" },
      take: 10,
      include: {
        user: { select: { email: true, name: true } },
        plan: { include: planInclude },
      },
    }),
    prisma.subscriptionRenewal.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        subscription: {
          include: {
            user: { select: { email: true, name: true } },
            plan: { include: planInclude },
          },
        },
      },
    }),
  ]);
  const count = new Map<SubscriptionStatus, number>(
    statuses.map((row) => [row.status, row._count._all]),
  );
  return {
    plans: plans.items,
    summary: {
      active: count.get("ACTIVE") ?? 0,
      paused: count.get("PAUSED") ?? 0,
      cancelled: count.get("CANCELLED") ?? 0,
    },
    upcoming,
    recentRenewals,
  };
}