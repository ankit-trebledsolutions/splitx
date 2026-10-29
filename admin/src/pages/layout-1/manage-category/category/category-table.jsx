import { useCallback, useMemo, useState } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { arrayMove } from '@dnd-kit/sortable';
import { Pencil, Search, Trash2 } from 'lucide-react';
import { toWords } from 'number-to-words';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CardFooter,
  CardHeader,
  CardTable,
  CardTitle,
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import {
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from '@/components/ui/data-grid-table';
import {
  DataGridTableDndRowHandle,
  DataGridTableDndRows,
} from '@/components/ui/data-grid-table-dnd-rows';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  useDeleteCategoryMutation,
  useReorderCategoriesMutation,
  useToggleCategoryStatusMutation,
} from '@/features/category/categoryApi';
import {
  selectCategoryPagination,
  selectCategorySearchTerm,
} from '@/features/category/categorySelectors';
import {
  openCreateDialog,
  openEditDialog,
  openSubCategory,
  setSearchTerm,
} from '@/features/category/categorySlice';
import CategoryPagination from './category-pagination';

const columnHelper = createColumnHelper();

const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;

const CategoryTable = ({ categories, loading, totalItems }) => {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectCategorySearchTerm);
  const pagination = useAppSelector(selectCategoryPagination);
  const [rowSelection, setRowSelection] = useState({});
  const [deleteCategory] = useDeleteCategoryMutation();
  const [toggleCategoryStatus] = useToggleCategoryStatusMutation();
  const [reorderCategories] = useReorderCategoriesMutation();

  const handleDeleteCategory = useCallback(async (categoryId) => {
    try {
      await deleteCategory(categoryId).unwrap();
      toast.success('Category deleted successfully');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete category'));
      console.error('Failed while deleting the Category:', error);
    }
  }, [deleteCategory]);

  const handleToggleCategoryStatus = useCallback(async (categoryId) => {
    try {
      await toggleCategoryStatus(categoryId).unwrap();
      toast.success('Category status updated successfully');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update category status'));
      console.error('Failed while toggling Category status:', error);
    }
  }, [toggleCategoryStatus]);

  const handleDragEnd = useCallback(async ({ active, over }) => {
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((cat) => cat._id === active.id);
    const newIndex = categories.findIndex((cat) => cat._id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedCategories = arrayMove(categories, oldIndex, newIndex);
    const items = reorderedCategories.map((category, index) => ({
      id: category._id,
      order: index,
    }));

    try {
      const data = await reorderCategories(items).unwrap();
      toast.success(data?.message || 'Categories reordered successfully');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to reorder categories'));
      console.error('Failed while reordering Categories:', error);
    }
  }, [categories, reorderCategories]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => <DataGridTableRowSelectAll size="sm" />,
        size: 56,
        enableSorting: false,
        cell: ({ row }) => <DataGridTableRowSelect row={row} size="sm" />,
      }),
      columnHelper.display({
        id: 'drag-handle',
        header: '',
        size: 56,
        enableSorting: false,
        cell: ({ row }) => (
          <DataGridTableDndRowHandle rowId={row.original._id} />
        ),
      }),
      columnHelper.accessor('categoryName', {
        header: 'Category name',
        size: 200,
      }),
      columnHelper.accessor('noOfSubCategories', {
        header: 'Sub Category',
        size: 150,
        cell: ({ getValue, row }) => {
          return (
            <Badge
              onClick={() => {
                if (getValue() > 0) {
                  dispatch(
                    openSubCategory({
                      id: row.original._id,
                      name: row.original.categoryName,
                    }),
                  );
                }
              }}
              shape="circle"
              size="lg"
              variant={row.original.noOfSubCategories === 0 ? 'destructive' : 'primary'}
              appearance="outline"
              className={`${row.original.noOfSubCategories > 0 ? 'cursor-pointer' : ''}`}
            >
              {row.original.noOfSubCategories +
                ' ' +
                `${toWords(row.original.noOfSubCategories).charAt(0).toUpperCase() + toWords(row.original.noOfSubCategories).slice(1)}`}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        size: 100,
        cell: ({ getValue, row }) => (
          <Switch
            checked={getValue()}
            className="data-[state=checked]:bg-blue-500"
            onCheckedChange={() => handleToggleCategoryStatus(row.original._id)}
          />
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 100,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch(openEditDialog(row.original))}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteCategory(row.original._id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      }),
    ],
    [dispatch, handleDeleteCategory, handleToggleCategoryStatus],
  );

  const table = useReactTable({
    data: categories,
    columns,
    state: {
      rowSelection,
      pagination: {
        pageIndex: pagination.currentPage - 1,
        pageSize: pagination.pageSize,
      },
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row._id,
  });

  return (
    <DataGrid
      table={table}
      recordCount={totalItems}
      isLoading={loading}
      tableLayout={{
        rowBorder: true,
        cellBorder: true,
        rowsDraggable: true,
        width: 'fixed',
      }}
      tableClassNames={{
        base: 'min-w-full',
        edgeCell: 'first:ps-5 last:pe-5',
      }}
      emptyMessage={
        <div className="flex flex-col items-center gap-2 py-6">
          <Search className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No categories found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search terms
          </p>
        </div>
      }
    >
      <CardHeader className="min-h-0 gap-4 px-5 py-4">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">
              Categories ({totalItems})
            </CardTitle>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) =>
                  dispatch(setSearchTerm(event.target.value))
                }
                placeholder="Search categories..."
                className="w-full pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => dispatch(openCreateDialog())}
            >
              Create Category
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardTable className="overflow-x-auto">
        <DataGridTableDndRows
          handleDragEnd={handleDragEnd}
          dataIds={categories.map((category) => category._id)}
        />
      </CardTable>

      <CardFooter className="px-5">
        <CategoryPagination totalItems={totalItems} />
      </CardFooter>
    </DataGrid>
  );
};

export default CategoryTable;
