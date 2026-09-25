import { useCallback, useMemo, useState } from 'react';
import {
  useDeleteCarouselImageMutation,
  useReorderCarouselImagesMutation,
} from '@/features/image-carousel/imageCarouselApi';
import {
  openCreateCarouselImageDialog,
  openEditCarouselImageDialog,
} from '@/features/image-carousel/imageCarouselSlice';
import { arrayMove } from '@dnd-kit/sortable';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ImageIcon, Pencil, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader, CardTable, CardTitle } from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import {
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from '@/components/ui/data-grid-table';
import {
  DataGridTableDndRowHandle,
  DataGridTableDndRows,
} from '@/components/ui/data-grid-table-dnd-rows';
import { useAppDispatch } from '@/app/hooks';

const columnHelper = createColumnHelper();
const getImageUrl = (image) => {
  const baseUrl = import.meta.env.VITE_BASE_URL || 'http://localhost:3000';
  return image?.startsWith('http') ? image : `${baseUrl}${image}`;
};
const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;

const CarouselImageTable = ({ carousel, images, loading }) => {
  const dispatch = useAppDispatch();
  const [rowSelection, setRowSelection] = useState({});
  const [deleteCarouselImage] = useDeleteCarouselImageMutation();
  const [reorderCarouselImages] = useReorderCarouselImagesMutation();

  const handleDeleteImage = useCallback(
    async (imageId) => {
      try {
        await deleteCarouselImage(imageId).unwrap();
        toast.success('Carousel image deleted successfully');
      } catch (error) {
        toast.error(error?.data?.message || 'Failed to delete carousel image');
        console.error('Failed while deleting carousel image:', error);
      }
    },
    [deleteCarouselImage],
  );

  const handleDragEnd = useCallback(
    async ({ active, over }) => {
      if (!over || active.id === over.id) return;

      const oldIndex = images.findIndex((cat) => cat._id === active.id);
      const newIndex = images.findIndex((cat) => cat._id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedimages = arrayMove(images, oldIndex, newIndex);
      const items = reorderedimages.map((image, index) => ({
        id: image._id,
        order: index,
      }));

      try {
        const data = await reorderCarouselImages(items).unwrap();
        toast.success(data?.message || 'Images reordered successfully');
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to reorder Images'));
        console.error('Failed while reordering Images:', error);
      }
    },
    [images, reorderCarouselImages],
  );

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
      columnHelper.accessor('image', {
        header: 'Image',
        size: 140,
        cell: ({ getValue }) => (
          <div className="flex items-center gap-3">
            <img
              src={getImageUrl(getValue())}
              alt=""
              className="h-14 w-24 rounded-md border object-cover"
            />
          </div>
        ),
      }),
      columnHelper.accessor('title', {
        header: 'Title',
        size: 260,
      }),
      columnHelper.accessor('isActive', {
        header: 'Status',
        size: 100,
        cell: ({ getValue }) => (
          <Badge
            variant={getValue() ? 'success' : 'secondary'}
            appearance="outline"
          >
            {getValue() ? 'Active' : 'Inactive'}
          </Badge>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 90,
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                dispatch(openEditCarouselImageDialog(row.original))
              }
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteImage(row.original._id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      }),
    ],
    [dispatch, handleDeleteImage],
  );

  const table = useReactTable({
    data: images,
    columns,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row._id,
  });

  return (
    <DataGrid
      table={table}
      recordCount={images.length}
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
          <p className="text-muted-foreground">No carousel images found</p>
        </div>
      }
    >
      <CardHeader className="min-h-0 gap-4 px-5 py-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <ImageIcon className="h-5 w-5" />
              {carousel?.name} images ({images.length})
            </CardTitle>
          </div>
          <Button
            variant="outline"
            onClick={() => dispatch(openCreateCarouselImageDialog())}
          >
            Create Image
          </Button>
        </div>
      </CardHeader>

      <CardTable className="overflow-x-auto">
        <DataGridTableDndRows
          handleDragEnd={handleDragEnd}
          dataIds={images.map((image) => image._id)}
        />
      </CardTable>
    </DataGrid>
  );
};

export default CarouselImageTable;
