const PUBLIC_UPLOAD_ERROR = '文件保存失败，请稍后重试';

export function publicUploadError(_error: unknown): string {
  return PUBLIC_UPLOAD_ERROR;
}
