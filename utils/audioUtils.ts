
import { Decoder, Reader, tools } from 'ts-ebml';

/**
 * Audio processing utilities
 */

export const encodeAudio = (bytes: Uint8Array): string => {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
  }
  return btoa(binary);
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Fix WebM file metadata to make it seekable.
 */
export const fixWebmDuration = async (blob: Blob, durationMs: number): Promise<Blob> => {
  if (!durationMs || durationMs <= 0) return blob;
  
  try {
    // Với bản bundle của esm.sh, ta có thể dùng trực tiếp các named export
    const decoder = new Decoder();
    const reader = new Reader();
    
    reader.logging = false;
    reader.drop_default_duration = false;

    const buffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    
    // Decode cấu trúc EBML
    const elms = decoder.decode(uint8Array);
    elms.forEach((elm) => reader.read(elm));
    reader.stop();

    // Tái cấu trúc metadata với Duration và Cues chuẩn
    const refinedMetadataBuf = tools.makeMetadataSeekable(
      reader.metadatas,
      durationMs,
      reader.cues
    );
    
    // Hợp nhất header mới với dữ liệu âm thanh gốc
    const body = uint8Array.slice(reader.metadataSize);
    return new Blob([refinedMetadataBuf, body], { type: blob.type });
  } catch (e: any) {
    console.warn("WebM duration fix failed (non-critical):", e.message);
    // Trả về blob gốc nếu lỗi để không làm gián đoạn luồng ứng dụng
    return blob;
  }
};
