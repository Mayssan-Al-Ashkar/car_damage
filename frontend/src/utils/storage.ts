export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(dataUrl: string, fallbackName = 'image.jpg'): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], fallbackName, { type: mime });
}

export function saveLS<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadLS<T>(key: string): T | null {
  const s = localStorage.getItem(key);
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}


