# MASTER CODEX PROMPT: Hierarchical Category & Subcategory Management Flow

## 1. Executive Summary & Objective

Refactor and upgrade the entire **Category and Subcategory Management Flow** in the Admin Catalog (`src/components/admin/ProductsPanel.tsx`, `src/app/api/admin/catalog/route.ts`, and `src/components/admin/admin.module.css`).

### Core Pain Points with the Current Implementation:
1. **Broken / Clunky Creation Flow**:
   - Currently uses native browser `window.prompt()` for both category and subcategory creation (`addCategory(parentRequired)`).
   - Requires manual typing of parent category names via comma-separated string matching.
   - Lacks an intuitive step-by-step hierarchical creation flow.
2. **Flat & Disorganized Drawer UI**:
   - "Manage categories" renders a flat, unordered dump of `.configCard` components.
   - No visual tree hierarchy between parent (top-level) categories and child subcategories.
   - No inline ability to add a subcategory directly under an existing category.
3. **Completely Missing Delete Functionality**:
   - No category delete button in the UI.
   - No `DELETE` HTTP endpoint in `/api/admin/catalog/route.ts`.
   - No safety checks for assigned products (`onDelete: Restrict` constraint in Prisma).

### Target Goal:
Deliver a **modern, intuitive, hierarchical Category Tree Manager**:
1. **Pehle Main Category Add Karein**: Admin can effortlessly create a top-level category via a clean quick-add bar (no `window.prompt`).
2. **Uske Andar Subcategories One-by-One Add Karein**: Right inside the created category's tree card, admin can click `+ Add Subcategory` and add subcategories one-by-one seamlessly with instant UI updates.
3. **Hierarchical Tree View**: Clean accordion/tree list showing root categories and their nested subcategories with product counts, active status, and quick action buttons.
4. **Safe Deletion Flow**: Delete button (trash icon) for categories and subcategories with confirmation dialog and backend validation (blocks deletion if products are currently assigned to prevent database constraint errors).
5. **Inline / Modal Editing**: Ability to edit category name, slug, description, image, storefront sort order, and active visibility.

---

## 2. Relevant Files & Architecture

| File | Purpose | Required Changes |
| :--- | :--- | :--- |
| `src/app/api/admin/catalog/route.ts` | Backend Catalog API (Next.js route handler) | Add `DELETE` handler for categories with safety checks (product count, subcategories check). Verify `POST` and `PATCH` slug & parent validation. |
| `src/components/admin/ProductsPanel.tsx` | Admin Products & Catalog UI | Remove `window.prompt` functions. Build hierarchical category tree, quick inline add for root & subcategories, delete confirmation dialog, and edit controls. |
| `src/components/admin/admin.module.css` | Admin Design System Styles | Add CSS styles for the hierarchical category tree, nested tree branches, action buttons, inline input bars, and delete modal. |
| `prisma/schema.prisma` | Database schema reference | Reference only: `Category` has `parentId`, `children`, and `Product` has `onDelete: Restrict` for `categoryId`. |

---

## 3. Backend Specification (`src/app/api/admin/catalog/route.ts`)

### 3.1 Implement `DELETE` Method for Categories

Add a robust `DELETE` handler in `src/app/api/admin/catalog/route.ts`:

```typescript
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId") || searchParams.get("id");
    const type = searchParams.get("type") || "category";

    if (type !== "category" || !categoryId) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "A valid category ID is required." } },
        { status: 400 }
      );
    }

    const prisma = getPrisma();

    // 1. Fetch category with children and relation counts
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        children: { select: { id: true, name: true } },
        _count: {
          select: {
            products: true,      // Primary category link
            productLinks: true,  // Cross-listed ProductCategory link
          },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: { code: "CATEGORY_NOT_FOUND", message: "Category not found." } },
        { status: 404 }
      );
    }

    // 2. Block deletion if primary products are assigned
    const totalAssignedProducts = category._count.products;
    if (totalAssignedProducts > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CATEGORY_HAS_PRODUCTS",
            message: `Cannot delete "${category.name}" because ${totalAssignedProducts} product(s) are assigned to it. Please reassign or delete these products first.`,
          },
        },
        { status: 409 }
      );
    }

    // 3. Block deletion if category has subcategories
    if (category.children.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CATEGORY_HAS_CHILDREN",
            message: `Cannot delete "${category.name}" because it contains ${category.children.length} subcategory(ies). Delete or move the subcategories first.`,
          },
        },
        { status: 409 }
      );
    }

    // 4. Safe cleanup of secondary links and delete category in transaction
    await prisma.$transaction(async (tx) => {
      // Remove cross-listed ProductCategory rows if any (secondary links)
      await tx.productCategory.deleteMany({
        where: { categoryId: category.id },
      });

      // Remove coupon category links
      await tx.couponCategory.deleteMany({
        where: { categoryId: category.id },
      });

      // Unlink personalization templates (schema sets null, but be explicit)
      await tx.personalizationTemplate.updateMany({
        where: { categoryId: category.id },
        data: { categoryId: null },
      });

      // Delete the category record
      await tx.category.delete({
        where: { id: category.id },
      });
    });

    revalidatePath("/", "layout");

    return NextResponse.json({
      success: true,
      message: `Category "${category.name}" was successfully deleted.`,
    });
  } catch (error) {
    return onboardingApiError(error);
  }
}
```

### 3.2 Verify `POST` and `PATCH` Handlers
- Ensure `POST` handles:
  - `parentId`: If provided, validates parent exists and has no `parentId` (enforces max 2 levels: Main Category -> Subcategory).
  - Generates a unique slug if collision occurs (or returns readable error).
  - Default `sortOrder`: `prisma.category.count({ where: { parentId: parsed.data.parentId ?? null } })` so new items appear at the end.
- Ensure `PATCH` allows updating:
  - `name`, `parentId`, `description`, `imageUrl`, `isActive`, `sortOrder`.

---

## 4. Frontend UI/UX Specification (`src/components/admin/ProductsPanel.tsx`)

### 4.1 Remove Legacy Prompt Logic
- Remove `window.prompt` in `addCategory(parentRequired)`.
- Replace the two top buttons (`Add category` and `Add subcategory`) in the `PageHeader` actions with:
  - `<button className={styles.buttonPrimary} onClick={() => { setManagingCategories(true); setCategoryAddMode("root"); }}><Plus size={14} /> Manage / Add Categories</button>`
  - (Keep `Add product` and `Export` buttons clean).

### 4.2 Data Hierarchy Organization
Compute a clean hierarchical category tree from `categoryRecords`:

```typescript
type CategoryTreeItem = CategoryRecord & {
  children: CategoryRecord[];
  productCount: number;
};

// In ProductsPanel:
const categoryTree = useMemo<CategoryTreeItem[]>(() => {
  // Count products assigned to each category (both primary and secondary)
  const counts = new Map<string, number>();
  for (const product of catalog) {
    const ids = new Set([product.categoryId, ...(product.categoryIds ?? [])]);
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const rootCategories = categoryRecords
    .filter((cat) => !cat.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const byParent = new Map<string, CategoryRecord[]>();
  for (const cat of categoryRecords) {
    if (cat.parentId) {
      const list = byParent.get(cat.parentId) ?? [];
      list.push(cat);
      byParent.set(cat.parentId, list);
    }
  }

  return rootCategories.map((root) => ({
    ...root,
    productCount: counts.get(root.id) ?? 0,
    children: (byParent.get(root.id) ?? []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    ),
  }));
}, [categoryRecords, catalog]);
```

### 4.3 Category Management Drawer / Modal Layout Wireframe

In `managingCategories` drawer:

```
+-------------------------------------------------------------------------+
| Manage Categories                                                   [X] |
| Organize main categories and their subcategories.                       |
+-------------------------------------------------------------------------+
| [+ Add New Main Category _____________________________] [ + Create ]    |
+-------------------------------------------------------------------------+
| CATEGORY TREE:                                                          |
|                                                                         |
| v [Folder Icon] Custom Packaging (12 products) [Active]                 |
|   | Description: High-grade boxes and cartons                           |
|   | Actions: [+ Add Subcategory]  [Edit]  [Delete]                      |
|   |                                                                     |
|   +--- [L] Corrugated Boxes (8 products) [Active]    [Edit] [Delete]    |
|   +--- [L] Rigid Gift Boxes (4 products) [Active]    [Edit] [Delete]    |
|   +--- [L] Mailer Boxes (0 products) [Active]        [Edit] [Delete]    |
|   |                                                                     |
|   +--- [+ Enter new subcategory name...] [Add Subcategory]              |
|                                                                         |
| > [Folder Icon] School & Office Stationery (25 products)                |
|   Actions: [+ Add Subcategory]  [Edit]  [Delete]                        |
|                                                                         |
| > [Folder Icon] Stickers & Labels (18 products)                         |
|   Actions: [+ Add Subcategory]  [Edit]  [Delete]                        |
+-------------------------------------------------------------------------+
| [Accordion: Starter Category Presets (RanBazaar / Packaging)]           |
+-------------------------------------------------------------------------+
```

### 4.4 Step-by-Step User Flow Implementation:

#### Step 1: Add Main Category (Pehle Category Add Hogi)
- Sticky top quick-add input inside the drawer:
  - Input: placeholder `"Enter new category name (e.g. Corporate Gifts)..."`
  - Button: `"+ Add Category"`
  - Hitting `Enter` or clicking button:
    - Calls `POST /api/admin/catalog` with `{ type: "category", name: trimmed, parentId: null }`.
    - Shows instant loading state.
    - On success: clears input, refreshes catalog via `loadCatalog()`, automatically expands the newly created category in the tree, and focuses the subcategory input!

#### Step 2: Add Subcategories One-by-One (Uske Andar Subcategory One by One Add Hogi)
- Under each parent category card, there is an inline subcategory creator:
  - Clicking `+ Add Subcategory` opens a compact inline row:
    - Input: placeholder `"Subcategory name (e.g. Rigid Boxes)..."`
    - Button: `"Add"`
    - Button: `"Cancel"`
  - Hitting `Enter` or clicking `"Add"`:
    - Calls `POST /api/admin/catalog` with `{ type: "category", name: trimmed, parentId: rootCategory.id }`.
    - Automatically stays open so the user can immediately type the **next** subcategory and hit Enter again (seamless one-by-one addition!).
    - Displays newly added subcategories immediately in the nested list with a checkmark or animation.

#### Step 3: Delete Category / Subcategory (Usi Me Se Delete Kar Paye)
- Each category and subcategory row has a Delete action (`Trash2` icon):
  - Clicking Delete shows a clean confirmation prompt / modal:
    - `"Delete Category: Are you sure you want to delete '{name}'?"`
    - Displays product count: `"This category currently has X linked products."`
    - If it has subcategories: `"This category has X subcategories. Please remove subcategories first."`
    - Actions: `[Cancel]` and `[Delete Forever]` (red danger button).
  - Clicking confirm calls `DELETE /api/admin/catalog?categoryId={id}`:
    - If database constraint blocks it (products exist), catches the 409 error and displays the backend message prominently in the drawer:
      `"Cannot delete '{name}': 4 products are still using this category."`
    - If successful, removes the item from the tree and shows a success toast/status message.

#### Step 4: Inline / Modal Editing (Optional Expansion)
- Clicking `[Edit]` on any category/subcategory expands an editing card with fields:
  - Category Name
  - Sort Order (storefront ordering)
  - Description
  - Image URL
  - Active Toggle (checkbox: "Show this category on storefront")
  - `[Save Changes]` button calling `PATCH /api/admin/catalog`.

---

## 5. CSS Styles Specification (`src/components/admin/admin.module.css`)

Add clean, modern classes to match the existing admin design tokens (`--teal`, `--navy`, `--admin-surface`, `--admin-card-radius`, `--border-default`):

```css
/* Category Tree Container */
.categoryTreeContainer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

/* Quick Add Bar */
.categoryQuickAddBar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px;
  background: var(--surface-subtle);
  border: 1px dashed var(--border-default);
  border-radius: var(--admin-card-radius);
}

.categoryQuickAddInput {
  flex: 1;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--admin-control-radius);
  background: var(--surface-main);
  color: var(--text-heading);
  font-size: 13px;
}

/* Category Tree Node (Root) */
.categoryRootCard {
  border: 1px solid var(--border-default);
  border-radius: var(--admin-card-radius);
  background: var(--surface-main);
  overflow: hidden;
  transition: border-color 150ms ease;
}

.categoryRootCard:hover {
  border-color: var(--border-focus);
}

.categoryRootHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--surface-main);
  gap: 12px;
}

.categoryRootInfo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.categoryRootTitle {
  font-size: 14px;
  font-weight: 700;
  color: var(--navy);
  margin: 0;
}

.categoryBadge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.categoryBadgeActive {
  background: color-mix(in srgb, var(--teal) 15%, transparent);
  color: var(--teal);
}

.categoryActions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Subcategories Container */
.categorySubList {
  border-top: 1px solid var(--border-default);
  background: var(--surface-subtle);
  padding: 8px 12px 12px 28px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.categorySubItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--surface-main);
  border: 1px solid var(--border-default);
  border-radius: var(--admin-control-radius);
  gap: 8px;
}

.categorySubItemLeft {
  display: flex;
  align-items: center;
  gap: 8px;
}

.categoryTreeBranchLine {
  color: var(--text-muted);
  font-family: monospace;
}

/* Inline Subcategory Add */
.categorySubAddRow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding-top: 6px;
}

.categoryDeleteBtn {
  color: var(--danger);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  transition: background 120ms ease;
}

.categoryDeleteBtn:hover {
  background: var(--danger-bg);
}
```

---

## 6. Verification & Validation Checklist

Once implemented, test and verify the following:
1. **Creation Flow**:
   - [ ] Type a new root category (e.g. `"Custom Boxes"`) in the top input and hit `Enter`. It creates the category immediately without any `window.prompt`.
   - [ ] Inside `"Custom Boxes"`, click `+ Add Subcategory`.
   - [ ] Type subcategory 1 (e.g. `"Corrugated Box"`) and hit `Enter` -> created.
   - [ ] Type subcategory 2 (e.g. `"Mailer Box"`) and hit `Enter` -> created.
   - [ ] Subcategories appear neatly indented under `"Custom Boxes"`.
2. **Product Linking & Counts**:
   - [ ] Subcategories and main categories correctly display product count badges based on active products in the catalog.
3. **Delete Flow**:
   - [ ] Click delete on an empty subcategory -> confirmation prompt appears -> confirms -> category is deleted and disappears from UI.
   - [ ] Attempt to delete a category with active products -> backend returns `CATEGORY_HAS_PRODUCTS` -> frontend displays clear error alert advising user to reassign products first.
   - [ ] Attempt to delete a root category that has subcategories -> backend returns `CATEGORY_HAS_CHILDREN` -> frontend advises user to delete subcategories first.
4. **No Console Errors**:
   - [ ] No `window.prompt` calls.
   - [ ] No Hydration mismatches or missing key props.
   - [ ] Next.js router cache revalidation (`revalidatePath("/", "layout")`) succeeds.

