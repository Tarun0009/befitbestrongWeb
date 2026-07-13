"use client";

import { useState, type FormEvent } from "react";
import {
  useAdminListCategoriesQuery,
  useAdminCreateCategoryMutation,
  useAdminUpdateCategoryMutation,
  useAdminDeleteCategoryMutation,
} from "@/lib/catalogApi";

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
    <div className="space-y-8">
      <section>
        <h2 className="font-medium">Categories</h2>
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
          <ul className="mt-4 space-y-2">
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
  const dirty =
    name !== category.name || (description || null) !== (category.description ?? null);

  async function handleSave() {
    try {
      await update({
        id: category.id,
        body: { name, description: description || undefined },
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
    <li className="rounded-lg border border-border p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto_auto]">
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
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
        >
          {saving ? "…" : "Save"}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting || category.productCount > 0}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
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
    <section className="rounded-lg border border-border p-5">
      <h3 className="font-medium">New category</h3>
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
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isLoading ? "Creating…" : "Create category"}
        </button>
      </form>
    </section>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";
