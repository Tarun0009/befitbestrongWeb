import { catalogApi, type AdminProductDetail } from "@/lib/catalogApi";
import type {
  CloudinaryUploadEvidence,
  ProductImageUploadSignature,
  ProductMediaConfiguration,
} from "./types";

const productImagesApi = catalogApi.injectEndpoints({
  endpoints: (builder) => ({
    getProductMediaConfiguration: builder.query<ProductMediaConfiguration, void>({
      query: () => "/admin/media/config",
    }),
    createProductImageUploadSignature: builder.mutation<
      ProductImageUploadSignature,
      { productId: string; fileName: string; contentType: string }
    >({
      query: (body) => ({
        url: "/admin/media/upload-signatures",
        method: "POST",
        body,
      }),
    }),
    attachManagedProductImage: builder.mutation<
      { image: AdminProductDetail["images"][number] },
      { productId: string; upload: CloudinaryUploadEvidence; alt?: string | null }
    >({
      query: ({ productId, ...body }) => ({
        url: `/admin/products/${productId}/images/managed`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, input) => [
        "AdminProducts",
        { type: "AdminProduct" as const, id: input.productId },
        "Products",
        "Search",
      ],
    }),
    cleanupManagedProductImageUpload: builder.mutation<
      void,
      { productId: string; upload: CloudinaryUploadEvidence }
    >({
      query: (body) => ({
        url: "/admin/media/uploads/cleanup",
        method: "POST",
        body,
      }),
    }),
    reorderProductImages: builder.mutation<
      { imageIds: string[] },
      { productId: string; imageIds: string[] }
    >({
      query: ({ productId, imageIds }) => ({
        url: `/admin/products/${productId}/images/order`,
        method: "PATCH",
        body: { imageIds },
      }),
      invalidatesTags: (_result, _error, input) => [
        { type: "AdminProduct" as const, id: input.productId },
        "Products",
        "Search",
      ],
    }),
  }),
});

export const {
  useGetProductMediaConfigurationQuery,
  useCreateProductImageUploadSignatureMutation,
  useAttachManagedProductImageMutation,
  useCleanupManagedProductImageUploadMutation,
  useReorderProductImagesMutation,
} = productImagesApi;