import {
  useGetCarouselImagesQuery,
  useGetCarouselsQuery,
} from '@/features/image-carousel/imageCarouselApi';
import {
  selectActiveCarousel,
  selectCarouselPagination,
  selectCarouselSearchTerm,
} from '@/features/image-carousel/imageCarouselSelectors';
import { closeCarouselImages } from '@/features/image-carousel/imageCarouselSlice';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import {
  Toolbar,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import CarouselForm from './carousel-form';
import CarouselImageForm from './carousel-image-form';
import CarouselImageTable from './carousel-image-table';
import CarouselTable from './carousel-table';

const ImageCarousel = () => {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectCarouselSearchTerm);
  const pagination = useAppSelector(selectCarouselPagination);
  const selectedCarousel = useAppSelector(selectActiveCarousel);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const activeSearchTerm = searchTerm ? debouncedSearchTerm : '';
  const { data, isFetching } = useGetCarouselsQuery({
    search: activeSearchTerm,
    page: pagination.currentPage,
    limit: pagination.pageSize,
  });
  const { data: imageData, isFetching: isFetchingImages } =
    useGetCarouselImagesQuery(selectedCarousel?._id, {
      skip: !selectedCarousel?._id,
    });

  const carousels = data?.carousels ?? [];
  const totalItems = data?.total ?? 0;
  const carouselImages = imageData?.carouselImages ?? [];

  return (
    <div className="container">
      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>
            {selectedCarousel ? selectedCarousel.name : 'Carousel Management'}
          </ToolbarPageTitle>
          <ToolbarDescription>
            {selectedCarousel
              ? 'Manage carousel images'
              : 'Manage image carousels'}
          </ToolbarDescription>
        </ToolbarHeading>
      </Toolbar>

      <Breadcrumb className="px-1 py-2">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              onClick={() => dispatch(closeCarouselImages())}
              className="cursor-pointer hover:text-primary"
            >
              Carousels
            </BreadcrumbLink>
          </BreadcrumbItem>
          {selectedCarousel && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink>{selectedCarousel.name} images</BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardContent className="p-0">
          {selectedCarousel ? (
            <CarouselImageTable
              carousel={selectedCarousel}
              images={carouselImages}
              loading={isFetchingImages}
            />
          ) : (
            <CarouselTable
              carousels={carousels}
              loading={isFetching}
              totalItems={totalItems}
            />
          )}
        </CardContent>
      </Card>

      <CarouselForm />
      <CarouselImageForm />
    </div>
  );
};

export default ImageCarousel;
