const MB = 1024 * 1024;

export const COURSE_ASSET_MAX_UPLOAD_MB = 300;
export const COURSE_ASSET_MAX_UPLOAD_BYTES = COURSE_ASSET_MAX_UPLOAD_MB * MB;
export const COURSE_ASSET_MAX_UPLOAD_LABEL = `${COURSE_ASSET_MAX_UPLOAD_MB}MB`;

export function formatCourseAssetSizeMb(bytes: number): string {
  return (bytes / MB).toFixed(1);
}

export function courseAssetFileTooLargeMessage(file: File, label = 'File'): string {
  return `${label} quá lớn (${formatCourseAssetSizeMb(file.size)}MB). Giới hạn tối đa ${COURSE_ASSET_MAX_UPLOAD_LABEL}.`;
}

export function createCourseAssetUploadSizeError(file: File, label?: string): Error {
  const message = courseAssetFileTooLargeMessage(file, label);
  const error = new Error(message) as Error & {
    response?: { data: { error: string; message: string } };
  };
  error.response = { data: { error: message, message } };
  return error;
}
