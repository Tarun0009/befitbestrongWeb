import { Router } from "express";
import healthRoutes from "../modules/health/health.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import accountRoutes from "../modules/account/account.routes.js";
import adminRoutes from "../modules/admin/admin.routes.js";
import productsRoutes, {
  categoriesRouter,
} from "../modules/products/products.routes.js";
import searchRoutes from "../modules/search/search.routes.js";
import cartRoutes from "../modules/cart/cart.routes.js";
import checkoutRoutes from "../modules/checkout/checkout.routes.js";
import ordersRoutes from "../modules/orders/orders.routes.js";
import siteConfigRoutes from "../modules/siteConfig/siteConfig.routes.js";
import reviewsRoutes from "../modules/reviews/reviews.routes.js";
import wishlistRoutes from "../modules/wishlist/wishlist.routes.js";
import stockAlertsRoutes from "../modules/wishlist/stockAlerts.routes.js";
import loyaltyRoutes from "../modules/loyalty/loyalty.routes.js";
import bundleRoutes from "../modules/bundles/bundle.routes.js";
import subscriptionPlansRoutes from "../modules/subscriptions/subscriptionPlans.routes.js";
import subscriptionsRoutes from "../modules/subscriptions/subscriptions.routes.js";
import discoveryRoutes from "../modules/discovery/discovery.routes.js";
import serviceabilityRoutes from "../modules/serviceability/serviceability.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/auth", accountRoutes);
router.use("/admin", adminRoutes);
router.use("/products", productsRoutes);
router.use("/categories", categoriesRouter);
router.use("/search", searchRoutes);
router.use("/cart", cartRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/orders", ordersRoutes);
router.use("/site-config", siteConfigRoutes);
router.use("/reviews", reviewsRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/stock-alerts", stockAlertsRoutes);
router.use("/loyalty", loyaltyRoutes);
router.use("/bundles", bundleRoutes);
router.use("/subscription-plans", subscriptionPlansRoutes);
router.use("/subscriptions", subscriptionsRoutes);
router.use("/discovery", discoveryRoutes);
router.use("/serviceability", serviceabilityRoutes);

export default router;
