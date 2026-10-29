export const selectCategorySearchTerm = (state) => state.category.searchTerm;
export const selectCategoryParentId = (state) => state.category.parentId;
export const selectCategoryBreadcrumbPath = (state) =>
  state.category.breadcrumbPath;
export const selectCategorySelectedCategory = (state) =>
  state.category.selectedCategory;
export const selectCategoryDialogType = (state) => state.category.dialogType;
export const selectCategoryPagination = (state) => state.category.pagination;
