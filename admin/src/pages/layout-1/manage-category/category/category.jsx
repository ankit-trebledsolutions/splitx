import React from 'react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Toolbar,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  selectCategoryBreadcrumbPath,
  selectCategoryPagination,
  selectCategoryParentId,
  selectCategorySearchTerm,
} from '@/features/category/categorySelectors';
import { navigateToBreadcrumb } from '@/features/category/categorySlice';
import { useGetCategoriesQuery } from '@/features/category/categoryApi';
import CategoryTable from './category-table';
import CategoryForm from './category-form';

const Category = () => {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectCategorySearchTerm);
  const parentId = useAppSelector(selectCategoryParentId);
  const pagination = useAppSelector(selectCategoryPagination);
  const breadcrumbPath = useAppSelector(selectCategoryBreadcrumbPath);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const activeSearchTerm = searchTerm ? debouncedSearchTerm : '';
  const { data, isFetching } = useGetCategoriesQuery({
    search: activeSearchTerm,
    parentId,
    page: pagination.currentPage,
    limit: pagination.pageSize,
  });

  const categories = data?.categories ?? [];
  const totalItems = data?.total ?? 0;

  return (
    <div className="container">
      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Category</ToolbarPageTitle>
          <ToolbarDescription>
            Create, manage categories and sub-categories
          </ToolbarDescription>
        </ToolbarHeading>
      </Toolbar>
      
      {/* Breadcrumb Navigation */}
      <Breadcrumb className="px-1 py-2">
        <BreadcrumbList>
          {breadcrumbPath.map((item, index) => (
            <React.Fragment key={item.id || index}>
              <BreadcrumbItem>
                <BreadcrumbLink 
                  onClick={() => {
                    dispatch(
                      navigateToBreadcrumb({
                        id: item.id,
                        index,
                      }),
                    );
                  }}
                  className="cursor-pointer hover:text-primary"
                >
                  {item.name}
                </BreadcrumbLink> 
              </BreadcrumbItem>
              {index < breadcrumbPath.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardContent className="p-0">
          <CategoryTable
            categories={categories}
            loading={isFetching}
            totalItems={totalItems}
          />
        </CardContent>
      </Card>

      <CategoryForm />
    </div>
  );
};

export default Category;
