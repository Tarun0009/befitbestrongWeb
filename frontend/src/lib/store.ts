import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@/features/auth/authSlice";
import cartUiReducer from "@/features/cart/cartSlice";
import { authApi } from "@/lib/authApi";
import { catalogApi } from "@/lib/catalogApi";
import { cartApi } from "@/lib/cartApi";
import { ordersApi } from "@/lib/ordersApi";
import { adminAnalyticsApi } from "@/lib/adminAnalyticsApi";
import { siteConfigApi } from "@/lib/siteConfigApi";
import { reviewsApi } from "@/features/reviews/reviewsApi";
import { wishlistApi } from "@/features/wishlist/wishlistApi";
import { loyaltyApi } from "@/features/loyalty/loyaltyApi";
import { bundlesApi } from "@/features/bundles/bundlesApi";
import { subscriptionsApi } from "@/features/subscriptions/subscriptionsApi";
import { discoveryApi } from "@/features/discovery/discoveryApi";

export const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      cartUi: cartUiReducer,
      [authApi.reducerPath]: authApi.reducer,
      [catalogApi.reducerPath]: catalogApi.reducer,
      [cartApi.reducerPath]: cartApi.reducer,
      [ordersApi.reducerPath]: ordersApi.reducer,
      [adminAnalyticsApi.reducerPath]: adminAnalyticsApi.reducer,
      [siteConfigApi.reducerPath]: siteConfigApi.reducer,
      [reviewsApi.reducerPath]: reviewsApi.reducer,
      [wishlistApi.reducerPath]: wishlistApi.reducer,
      [loyaltyApi.reducerPath]: loyaltyApi.reducer,
      [bundlesApi.reducerPath]: bundlesApi.reducer,
      [subscriptionsApi.reducerPath]: subscriptionsApi.reducer,
      [discoveryApi.reducerPath]: discoveryApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        authApi.middleware,
        catalogApi.middleware,
        cartApi.middleware,
        ordersApi.middleware,
        adminAnalyticsApi.middleware,
        siteConfigApi.middleware,
        reviewsApi.middleware,
        wishlistApi.middleware,
        loyaltyApi.middleware,
        bundlesApi.middleware,
        subscriptionsApi.middleware,
        discoveryApi.middleware,
      ),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];



