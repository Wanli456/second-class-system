import assert from 'node:assert/strict';
import { publicUploadError } from './upload-error';

const storageError = new Error("EROFS: read-only file system, open '/opt/second-class/public/uploads/example.jpg'");

assert.equal(publicUploadError(storageError), '文件保存失败，请稍后重试');
