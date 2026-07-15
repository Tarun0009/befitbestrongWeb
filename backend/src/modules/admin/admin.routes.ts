import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { updateUserRole } from "../auth/auth.service.js";
import adminCatalogRoutes from "./adminCatalog.routes.js";
import adminOrdersRoutes from "./adminOrders.routes.js";
import adminAnalyticsRoutes from "./adminAnalytics.routes.js";
import adminSiteConfigRoutes from "./adminSiteConfig.routes.js";
import adminCouponsRoutes from "./adminCoupons.routes.js";
import adminReviewsRoutes from "../reviews/adminReviews.routes.js";
import adminDemandRoutes from "../wishlist/adminDemand.routes.js";
import adminLoyaltyRoutes from "../loyalty/adminLoyalty.routes.js";
import adminBundlesRoutes from "../bundles/adminBundles.routes.js";
import adminSubscriptionsRoutes from "../subscriptions/adminSubscriptions.routes.js";
import adminServiceabilityRoutes from "../serviceability/adminServiceability.routes.js";
import adminNotificationRoutes from "../notifications/adminNotification.routes.js";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));
router.use("/", adminCatalogRoutes);
router.use("/", adminOrdersRoutes);
router.use("/", adminAnalyticsRoutes);
router.use("/", adminSiteConfigRoutes);
router.use("/", adminCouponsRoutes);
router.use("/", adminReviewsRoutes);
router.use("/", adminDemandRoutes);
router.use("/", adminLoyaltyRoutes);
router.use("/", adminBundlesRoutes);
router.use("/", adminSubscriptionsRoutes);
router.use("/", adminServiceabilityRoutes);
router.use("/", adminNotificationRoutes);

const roleBody = z.object({
  role: z.enum(["CUSTOMER", "ADMIN"]),
});

const idParam = z.object({
  id: z.string().cuid(),
});

router.post("/users/:id/role", async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const { role } = roleBody.parse(req.body);
    const user = await updateUserRole(id, role);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
