import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const MAX_LISTING_PHOTOS = 5;
export const MAX_LISTING_PHOTO_BYTES = 512 * 1024;
const MAX_IMAGE_SIDE = 1280;

export type PreparedListingPhoto = {
  uri: string;
  size: number;
};

export async function prepareListingPhoto(uri: string): Promise<PreparedListingPhoto> {
  const image = await ImageManipulator.manipulate(uri, {
    maxWidth: MAX_IMAGE_SIDE,
    maxHeight: MAX_IMAGE_SIDE,
  }).renderAsync();

  for (const compress of [0.82, 0.72, 0.62, 0.52, 0.42, 0.32, 0.22, 0.14]) {
    const result = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress,
    });
    const file = new File(result.uri);
    const size = file.size;

    if (size !== null && size > 0 && size <= MAX_LISTING_PHOTO_BYTES) {
      return { uri: result.uri, size };
    }

    file.delete();
  }

  throw new Error(
    'No se pudo comprimir esta foto por debajo de 512 KiB. Prueba con otra imagen.'
  );
}
