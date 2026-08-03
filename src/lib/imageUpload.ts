const MAX_IMAGE_DIMENSION = 1600;
const MAX_DATA_URL_LENGTH = 5_500_000;

interface OptimizeImageOptions {
  maxDimension?: number;
  maxDataUrlLength?: number;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
    image.src = source;
  });
}

function renderImage(image: HTMLImageElement, width: number, height: number, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持图片压缩");

  context.drawImage(image, 0, 0, width, height);
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

export async function optimizeImageDataUrl(source: string, options: OptimizeImageOptions = {}) {
  if (!source.startsWith("data:image/")) return source;

  const maxDimension = options.maxDimension ?? MAX_IMAGE_DIMENSION;
  const maxDataUrlLength = options.maxDataUrlLength ?? MAX_DATA_URL_LENGTH;
  const image = await loadImage(source);
  const initialScale = Math.min(1, maxDimension / image.naturalWidth, maxDimension / image.naturalHeight);
  let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
  let height = Math.max(1, Math.round(image.naturalHeight * initialScale));

  if (source.length <= maxDataUrlLength && initialScale === 1) return source;

  let quality = 0.82;
  let optimized = renderImage(image, width, height, quality);
  for (let attempt = 0; attempt < 6 && optimized.length > maxDataUrlLength; attempt += 1) {
    if (quality > 0.58) {
      quality -= 0.08;
    } else {
      width = Math.max(640, Math.round(width * 0.82));
      height = Math.max(640, Math.round(height * 0.82));
      quality = 0.72;
    }
    optimized = renderImage(image, width, height, quality);
  }

  return optimized;
}

export function optimizeImageFile(file: File, options?: OptimizeImageOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        resolve(await optimizeImageDataUrl(reader.result as string, options));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}
