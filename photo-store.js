/* photo-store.js — 运动会照片的压缩与托管。
 *
 * 按 config.js 的 provider 分两套：
 *   · "supabase"：压「缩略图 + 原图」两档传进 Storage 的 sports-photos 桶，
 *                 共享库里只留几十字节的路径；网格读缩略图、点开大图才拉原图。
 *   · "mantle"  ：老办法，整张 base64 内嵌进一条 entry，受 MantleDB 64 KB 限制，
 *                 只能压到 480~640 px（会糊）。迁移前线上就是这一套，行为不变。
 *
 * 建桶与权限见 supabase/202610160002_sports_photo_storage.sql。
 */
(function (root) {
  "use strict";

  const BUCKET = "sports-photos";
  const THUMB_EDGE = 480; // 网格里只显示 150 px，480 px 足够，单张约 25~40 KB
  const THUMB_QUALITIES = [0.75, 0.62, 0.5];
  const THUMB_MAX_BYTES = 90000;
  // 原图决定「点开看清楚」的观感：2048 px 长边在手机 2K 屏上也不虚。
  const FULL_EDGES = [2048, 1600, 1280];
  const FULL_QUALITIES = [0.88, 0.8, 0.72];
  const FULL_MAX_BYTES = 1500000;
  // 老路子（MantleDB）：一条记录 64 KB，base64 还要涨 4/3，只能给 45 KB
  const INLINE_EDGES = [1280, 1000, 800, 640, 480];
  const INLINE_QUALITIES = [0.8, 0.68, 0.56, 0.46];
  const INLINE_MAX_BYTES = 45000;

  function config() {
    return root.BANJI_CONFIG && typeof root.BANJI_CONFIG === "object" ? root.BANJI_CONFIG : {};
  }

  function baseUrl() {
    return String(config().supabaseUrl || "").replace(/\/+$/, "");
  }

  function storageMode() {
    const settings = config();
    return settings.provider === "supabase" && Boolean(baseUrl() && settings.supabaseAnonKey);
  }

  function authHeaders() {
    const key = String(config().supabaseAnonKey || "");
    return key ? { apikey: key, Authorization: `Bearer ${key}` } : {};
  }

  // 公开桶不用签名，<img src> 直接能用，也能被浏览器缓存。
  function publicUrl(path) {
    const text = String(path || "");
    if (!text) return "";
    return `${baseUrl()}/storage/v1/object/public/${BUCKET}/${text.split("/").map(encodeURIComponent).join("/")}`;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("这张图读不出来，请换一张 JPG 或 PNG。"));
      };
      image.src = url;
    });
  }

  function readDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("照片读取失败，请重试。"));
      reader.readAsDataURL(blob);
    });
  }

  function toBlob(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }

  // 统一转 JPEG 并补白底：PNG 的透明区域不补白会变成黑块。
  function drawScaled(image, edge) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const ratio = Math.min(1, edge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // 先降质量、再降尺寸，直到塞进 maxBytes；一直塞不下就返回最小的那个。
  // 顺序是「保尺寸优先」：手机看大图，分辨率比 JPEG 块效应更影响观感。
  async function encodeUnder(image, edges, qualities, maxBytes) {
    let smallest = null;
    for (const edge of edges) {
      const canvas = drawScaled(image, edge);
      for (const quality of qualities) {
        const blob = await toBlob(canvas, quality);
        if (!blob) continue;
        const current = { blob, width: canvas.width, height: canvas.height, bytes: blob.size };
        if (!smallest || blob.size < smallest.bytes) smallest = current;
        if (blob.size <= maxBytes) return current;
      }
    }
    return smallest;
  }

  async function prepare(file) {
    if (!file || String(file.type || "").indexOf("image/") !== 0) {
      throw new Error("请选择图片文件（JPG 或 PNG）。");
    }
    const image = await loadImage(file);
    if (storageMode()) {
      const thumb = await encodeUnder(image, [THUMB_EDGE], THUMB_QUALITIES, THUMB_MAX_BYTES);
      const full = await encodeUnder(image, FULL_EDGES, FULL_QUALITIES, FULL_MAX_BYTES);
      if (!thumb || !full) throw new Error("照片压缩失败，请换一张再试。");
      return {
        mode: "storage",
        // 预览用内存里的缩略图：不占记录体积，也不用等上传。
        previewUrl: URL.createObjectURL(thumb.blob),
        width: full.width,
        height: full.height,
        bytes: full.bytes,
        thumbBlob: thumb.blob,
        fullBlob: full.blob
      };
    }
    const inline = await encodeUnder(image, INLINE_EDGES, INLINE_QUALITIES, INLINE_MAX_BYTES);
    if (!inline) throw new Error("照片压缩失败，请换一张再试。");
    const dataUrl = await readDataUrl(inline.blob);
    return {
      mode: "inline",
      previewUrl: dataUrl,
      dataUrl,
      width: inline.width,
      height: inline.height,
      bytes: inline.bytes
    };
  }

  function uploadError(status, detail) {
    const error = new Error(
      status === 413
        ? "照片超过服务端允许的大小，换一张小一点的再试。"
        : `照片上传失败（${status || "网络中断"}），请检查网络后重试。`
    );
    error.status = status;
    error.detail = String(detail || "").slice(0, 200);
    return error;
  }

  async function uploadBlob(blob, path) {
    const response = await fetch(`${baseUrl()}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "image/jpeg",
        "cache-control": "max-age=31536000",
        "x-upsert": "true"
      },
      body: blob
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw uploadError(response.status, detail);
    }
  }

  // 缩略图先传：大图失败就把缩略图删掉，不留半张照片在桶里。
  async function uploadPhoto(photoId, draft) {
    if (!draft || draft.mode !== "storage") return {};
    const safe = String(photoId || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!safe) throw new Error("照片编号异常，请刷新页面重试。");
    const thumbPath = `${safe}-t.jpg`;
    const fullPath = `${safe}.jpg`;
    await uploadBlob(draft.thumbBlob, thumbPath);
    try {
      await uploadBlob(draft.fullBlob, fullPath);
    } catch (error) {
      await removePhoto({ thumb_path: thumbPath }).catch(() => {});
      throw error;
    }
    return { thumb_path: thumbPath, photo_path: fullPath };
  }

  // 对象删不掉不该让整件事失败——记录本身已经删了。
  async function removePhoto(record) {
    const paths = [record?.thumb_path, record?.photo_path].filter(Boolean);
    if (!paths.length || !storageMode()) return;
    const response = await fetch(`${baseUrl()}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths })
    });
    if (!response.ok && response.status !== 404) {
      const detail = await response.text().catch(() => "");
      throw uploadError(response.status, detail);
    }
  }

  root.BanjiPhotoStore = {
    BUCKET,
    storageMode,
    publicUrl,
    prepare,
    uploadPhoto,
    removePhoto,
    INLINE_MAX_BYTES
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
