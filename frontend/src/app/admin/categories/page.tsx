"use client";

import { useState, type FormEvent } from "react";
import {
  useAdminListCategoriesQuery,
  useAdminCreateCategoryMutation,
  useAdminUpdateCategoryMutation,
  useAdminDeleteCategoryMutation,
} from "@/lib/catalogApi";
import { buildChangedFields, hasChangedFields } from "@/lib/changedFields";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  productCount: number;
}

export default function AdminCategoriesPage() {
  const { data, isLoading } = useAdminListCategoriesQuery();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Catalog structure</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">Product categories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Slugs are auto-derived from the name. Renaming a category updates the
          slug — this may break bookmarked category URLs.
        </p>

        {isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            No categories yet. Add one below.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {data.items.map((c) => (
              <CategoryRowEditor key={c.id} category={c} />
            ))}
          </ul>
        )}
      </section>

      <NewCategoryForm />
    </div>
  );
}

// ------------- Row editor -------------

function CategoryRowEditor({ category }: { category: CategoryRow }) {
  const [update, { isLoading: saving }] = useAdminUpdateCategoryMutation();
  const [remove, { isLoading: deleting }] = useAdminDeleteCategoryMutation();

  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");
  const categoryPatch = buildChangedFields(
    { name, description: description || null },
    { name: category.name, description: category.description },
  );
  const dirty = hasChangedFields(categoryPatch);

  async function handleSave() {
    try {
      await update({
        id: category.id,
        body: categoryPatch,
      }).unwrap();
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      alert(e.data?.error?.message ?? "Save failed.");
    }
  }

  async function handleDelete() {
    if (category.productCount > 0) {
      alert(
        `${category.productCount} product(s) still belong to this category. Reassign them first.`,
      );
      return;
    }
    if (!confirm(`Delete category "${category.name}"?`)) return;
    try {
      await remove(category.id).unwrap();
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      alert(e.data?.error?.message ?? "Delete failed.");
    }
  }

  return (
    <li className="rounded-xl border border-black/[0.07] bg-[#faf9f6] p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto_auto] sm:items-center">
        <label className="block">
          <span className="sr-only">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="sr-only">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className={inputCls}
          />
        </label>
        <span className="self-center text-xs tabular-nums text-muted-foreground">
          {category.productCount} product{category.productCount === 1 ? "" : "s"}
        </span>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold hover:bg-black/[0.03] disabled:opacity-40"
        >
          {saving ? "…" : "Save"}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting || category.productCount > 0}
          className="h-10 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
          title={
            category.productCount > 0
              ? "Reassign products before deleting"
              : "Delete category"
          }
        >
          {deleting ? "…" : "Delete"}
        </button>
      </div>
      <p className="mt-2 text-xs font-mono text-muted-foreground">
        /{category.slug}
      </p>
    </li>
  );
}

// ------------- New category form -------------

function NewCategoryForm() {
  const [create, { isLoading }] = useAdminCreateCategoryMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      await create({
        name: name.trim(),
        description: description.trim() || undefined,
      }).unwrap();
      setName("");
      setDescription("");
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setError(e.data?.error?.message ?? "Couldn't create category.");
    }
  }

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Create</p>
      <h3 className="mt-2 text-lg font-semibold tracking-tight">New category</h3>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="e.g. Home & Kitchen"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Description (optional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isLoading}
          className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-95 disabled:opacity-50"
        >
          {isLoading ? "Creating…" : "Create category"}
        </button>
      </form>
    </section>
  );
}

const inputCls =
  "mt-1.5 h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35";
