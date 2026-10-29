import { useCallback, useMemo, useState } from 'react';
import {
  useDeleteCarouselMutation,
  useToggleCarouselStatusMutation,
} from '@/features/image-carousel/imageCarouselApi';
import {
  selectCarouselPagination,
  selectCarouselSearchTerm,
} from '@/features/image-carousel/imageCarouselSelectors';
import { Badge } from '@/components/ui/badge';
import {
  openCreateCarouselDialog,
  openEditCarouselDialog,
  openCarouselImages,
  setCarouselSearchTerm,
} from '@/features/image-carousel/imageCarouselSlice';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Search, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  CardFooter,
  CardHeader,
  CardTable,
  CardTitle,
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from '@/components/ui/data-grid-table';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { toWords } from 'number-to-words';
import CarouselPagination from './carousel-pagination';

const columnHelper = createColumnHelper();

const CarouselTable = ({ carousels, loading, totalItems }) => {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectCarouselSearchTerm);
  const pagination = useAppSelector(selectCarouselPagination);
  const [rowSelection, setRowSelection] = useState({});
  const [deleteCarousel] = useDeleteCarouselMutation();
  const [toggleCarouselStatus] = useToggleCarouselStatusMutation();

  const handleDeleteCarousel = useCallback(async (carouselId) => {
    try {
      await deleteCarousel(carouselId).unwrap();
      toast.success('Carousel deleted successfully');
    } catch (error) {
      toast.error(error?.data?.message || 'Failed to delete carousel');
      console.error('Failed while deleting carousel:', error);
    }
  }, [deleteCarousel]);

  const handleToggleCarouselStatus = useCallback(async (carouselId) => {
    try {
      await toggleCarouselStatus(carouselId).unwrap();
      toast.success('Carousel status updated successfully');
    } catch (error) {
      toast.error(error?.data?.message || 'Failed to update carousel status');
      console.error('Failed while toggling carousel status:', error);
    }
  }, [toggleCarouselStatus]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => <DataGridTableRowSelectAll size="sm" />,
        size: 40,
        enableSorting: false,
        cell: ({ row }) => <DataGridTableRowSelect row={row} size="sm" />,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        size: 300,
      }),
      columnHelper.accessor('noOfImages', {
        header: 'Images',
        size: 100,
        cell: ({ row }) => (
          <Badge
            onClick={() => {
              dispatch(openCarouselImages(row.original));
            }}
            shape="circle"
            size="lg"
            variant={row.original.noOfImages === 0 ? 'warning' : 'primary'}
            appearance="outline"
            className="cursor-pointer"
          >
            {row.original.noOfImages +
              ' ' +
              `${toWords(row.original.noOfImages).charAt(0).toUpperCase() + toWords(row.original.noOfImages).slice(1)}`}
          </Badge>
        ),
      }),
      columnHelper.accessor('isActive', {
        header: 'Status',
        size: 80,
        cell: ({ getValue, row }) => (
          <Switch
            className="data-[state=checked]:bg-blue-500"
            checked={getValue()}
            onCheckedChange={() => handleToggleCarouselStatus(row.original._id)}
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
              onClick={() => dispatch(openEditCarouselDialog(row.original))}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteCarousel(row.original._id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      }),
    ],
    [dispatch, handleDeleteCarousel, handleToggleCarouselStatus],
  );

  const table = useReactTable({
    data: carousels,
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
        width: 'fixed',
      }}
      tableClassNames={{
        base: 'min-w-full',
        edgeCell: 'first:ps-5 last:pe-5',
      }}
      emptyMessage={
        <div className="flex flex-col items-center gap-2 py-6">
          <Search className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No carousels found</p>
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
              Carousel ({totalItems})
            </CardTitle>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) =>
                  dispatch(setCarouselSearchTerm(event.target.value))
                }
                placeholder="Search carousels..."
                className="w-full pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => dispatch(openCreateCarouselDialog())}
            >
              Create Carousel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardTable className="overflow-x-auto">
        <DataGridTable />
      </CardTable>

      <CardFooter className="px-5">
        <CarouselPagination totalItems={totalItems} />
      </CardFooter>
    </DataGrid>
  );
};

export default CarouselTable;
